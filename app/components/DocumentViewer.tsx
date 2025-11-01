'use client'

import { useRef } from 'react'
import { saveAs } from 'file-saver'
// @ts-ignore - pizzip doesn't have perfect types
import PizZip from 'pizzip'
import { PlaceholderData } from '../types/placeholders'

interface DocumentViewerProps {
  content: string
  filledData?: Map<string, PlaceholderData>
  fileBuffer?: ArrayBuffer
}

export default function DocumentViewer({ content, filledData, fileBuffer }: DocumentViewerProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  const formatContent = (text: string) => {
    // Split by newlines and preserve formatting
    const paragraphs = text.split('\n').filter(p => p.trim() || p === '')
    return paragraphs.map((para, index) => {
      if (!para.trim()) {
        return <br key={index} />
      }
      return (
        <p key={index} className="mb-4 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
          {para}
        </p>
      )
    })
  }

  const handleDownload = async () => {
    try {
      if (!fileBuffer || !filledData) {
        alert('Original document data not available. Please upload the document again.')
        return
      }

      // Load the docx file as a zip
      const zip = new PizZip(fileBuffer)
      
      // Get the main document XML
      const docXml = zip.files['word/document.xml'].asText()
      
      // Replace placeholders in the XML while preserving formatting
      // First, remove all XML tags temporarily to find placeholders, then replace them
      let modifiedXml = docXml
      
      // Track which positions have been replaced to avoid double-replacement
      const replacedPositions = new Set<number>()
      
      // Process label-based fields first, sorted by position (descending) to avoid index shifting
      const labelFields: Array<{ key: string; data: PlaceholderData; position: number }> = []
      const otherFields: Array<{ key: string; data: PlaceholderData }> = []
      
      filledData.forEach((placeholderData, key) => {
        const isLabelField = placeholderData.info.originalFormat.endsWith(':') && 
                            !placeholderData.info.originalFormat.includes('[')
        if (isLabelField && placeholderData.info.position !== undefined) {
          labelFields.push({ key, data: placeholderData, position: placeholderData.info.position })
        } else {
          otherFields.push({ key, data: placeholderData })
        }
      })
      
      // Sort label fields by position descending to replace from end to beginning
      labelFields.sort((a, b) => b.position - a.position)
      
      // Process label fields first
      labelFields.forEach(({ key, data: placeholderData }) => {
        const { info, value } = placeholderData
        
        // Format the value - preserve prefix if it exists
        let formattedValue = value
        if (info.prefix && !value.startsWith(info.prefix)) {
          formattedValue = info.prefix + value.replace(/^\$/, '')
        }
        
        // Escape XML special characters in the replacement value
        const escapedValue = formattedValue
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
        
        // Replace placeholders that might be split across XML tags
        // Strategy: Replace placeholder text even if it's split by XML tags
        const placeholderText = info.originalFormat
        
        // Debug logging for Email fields
        const isEmailField = placeholderText.toLowerCase().includes('email')
        if (isEmailField) {
          console.log(`Processing Email field: ${key}, context: ${info.context}, position: ${info.position}, value: ${value}, placeholderText: "${placeholderText}"`)
        }
        
        // For label-based fields (like "Address:"), append value after the label
        const isLabelField = placeholderText.endsWith(':') && !placeholderText.includes('[')
        
        // For label fields, find the correct instance based on context and position
        // Helper function to find label in XML even when wrapped in tags
        const findLabelInXml = (xml: string, labelText: string): Array<{ xmlIndex: number; textIndex: number; context: 'company' | 'investor' | null }> => {
          const results: Array<{ xmlIndex: number; textIndex: number; context: 'company' | 'investor' | null }> = []
          
          // Create a regex that matches the label even if wrapped in XML tags
          // Pattern: <w:t>Address:</w:t> or <w:t>Address:</w:t><w:t></w:t> etc.
          // Also handle cases where label might be split: <w:t>Address</w:t><w:t>:</w:t>
          const escapedLabel = labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          
          // Special handling for Email labels - they might have different casing
          const isEmailLabel = labelText.toLowerCase().includes('email')
          
          // Try multiple patterns to catch different XML structures
          const patterns = [
            // Pattern 1: Label in single tag: <w:t>Address:</w:t> or <w:t>Email:</w:t>
            new RegExp(`(<w:t[^>]*>${escapedLabel}</w:t>)`, 'gi'),
            // Pattern 2: Label with optional tags: <w:t>Address:</w:t> or Address:
            new RegExp(`(<w:t[^>]*>)?${escapedLabel}(</w:t>)?`, 'gi'),
            // Pattern 3: Label split across tags: <w:t>Address</w:t><w:t>:</w:t>
            new RegExp(`(<w:t[^>]*>${escapedLabel.replace(/:/g, '')}</w:t>\\s*<w:t[^>]*>:</w:t>)`, 'gi'),
          ]
          
          // For Email labels, add case-insensitive pattern variations
          if (isEmailLabel) {
            patterns.push(
              // Pattern 4: Case-insensitive Email: <w:t>email:</w:t> or <w:t>EMAIL:</w:t>
              new RegExp(`(<w:t[^>]*>[Ee][Mm][Aa][Ii][Ll]:</w:t>)`, 'gi'),
              // Pattern 5: Email with optional tags (case-insensitive)
              new RegExp(`(<w:t[^>]*>)?[Ee][Mm][Aa][Ii][Ll]:(</w:t>)?`, 'gi'),
              // Pattern 6: Email with possible whitespace before colon
              new RegExp(`(<w:t[^>]*>[Ee][Mm][Aa][Ii][Ll]\\s*:</w:t>)`, 'gi')
            )
          }
          
          // Also try searching for trimmed label (handle whitespace)
          const trimmedLabel = labelText.trim()
          if (trimmedLabel !== labelText) {
            const escapedTrimmed = trimmedLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            patterns.push(
              new RegExp(`(<w:t[^>]*>${escapedTrimmed}</w:t>)`, 'gi'),
              new RegExp(`(<w:t[^>]*>)?${escapedTrimmed}(</w:t>)?`, 'gi')
            )
            if (isEmailLabel) {
              patterns.push(
                new RegExp(`(<w:t[^>]*>[Ee][Mm][Aa][Ii][Ll]:</w:t>)`, 'gi'),
                new RegExp(`(<w:t[^>]*>)?[Ee][Mm][Aa][Ii][Ll]:(</w:t>)?`, 'gi')
              )
            }
          }
          
          for (const pattern of patterns) {
            let match
            pattern.lastIndex = 0
            while ((match = pattern.exec(xml)) !== null) {
              const xmlIndex = match.index
              if (replacedPositions.has(xmlIndex)) continue
              
              // Get text before this match to determine context
              const beforeText = xml.substring(Math.max(0, xmlIndex - 5000), xmlIndex)
              // Remove XML tags to get plain text for context detection
              const plainBeforeText = beforeText.replace(/<[^>]+>/g, ' ').toLowerCase()
              
              // Also check a wider window for context markers
              const widerBeforeText = xml.substring(Math.max(0, xmlIndex - 10000), xmlIndex).replace(/<[^>]+>/g, ' ').toLowerCase()
              
              const companyMarker = Math.max(plainBeforeText.lastIndexOf('company'), widerBeforeText.lastIndexOf('company'))
              const investorMarker = Math.max(plainBeforeText.lastIndexOf('investor'), widerBeforeText.lastIndexOf('investor'))
              
              // Also check for company/investor markers in XML attributes or nearby text
              const companyInXml = beforeText.toLowerCase().includes('company') || widerBeforeText.includes('company')
              const investorInXml = beforeText.toLowerCase().includes('investor') || widerBeforeText.includes('investor')
              
              let context: 'company' | 'investor' | null = null
              if (companyMarker > investorMarker && companyMarker >= 0) {
                context = 'company'
              } else if (investorMarker >= 0 && investorMarker > companyMarker) {
                context = 'investor'
              } else if (companyMarker >= 0 && !investorInXml) {
                context = 'company'
              } else if (investorMarker >= 0 && !companyInXml) {
                context = 'investor'
              } else if (companyInXml && !investorInXml) {
                context = 'company'
              } else if (investorInXml && !companyInXml) {
                context = 'investor'
              } else if (companyInXml && investorInXml) {
                // Both found, use the closer one
                if (companyMarker > investorMarker) {
                  context = 'company'
                } else {
                  context = 'investor'
                }
              }
              
              // Calculate approximate text position (rough estimate)
              const textBefore = xml.substring(0, xmlIndex).replace(/<[^>]+>/g, '').length
              
              // Only add if we haven't seen this position before
              if (!results.find(r => r.xmlIndex === xmlIndex)) {
                results.push({ xmlIndex, textIndex: textBefore, context })
              }
            }
          }
          
          if (isEmailLabel) {
            console.log(`findLabelInXml: Found ${results.length} Email label matches using patterns`, results.map(r => ({ xmlIndex: r.xmlIndex, context: r.context })))
          }
          
          return results
        }
        
        if (info.context !== undefined && info.position !== undefined) {
          // Find all instances of this label in XML
          const allMatches = findLabelInXml(modifiedXml, placeholderText)
          
          if (isEmailField) {
            console.log(`Found ${allMatches.length} Email label matches in XML:`, allMatches.map(m => ({ 
              xmlIndex: m.xmlIndex, 
              textIndex: m.textIndex, 
              context: m.context,
              positionDiff: Math.abs(m.textIndex - info.position!)
            })))
          }
          
          // Find the matching label
          const matchingLabel = allMatches.find((label) => {
            if (label.context !== info.context) return false
            // Check if position is close (within 1000 chars in text space) or if this is the first of this context
            const positionDiff = Math.abs(label.textIndex - info.position)
            const isFirstOfContext = allMatches.filter(m => m.context === info.context && m.textIndex < label.textIndex).length === 0
            return positionDiff < 1000 || isFirstOfContext
          })
          
          // If no exact match found, try a more lenient approach for Email
          let finalMatchingLabel = matchingLabel
          if (!finalMatchingLabel && isEmailField) {
            // If we found Email labels but they have null context, try matching by position order
            // First Email label = Company, Second = Investor
            if (allMatches.length >= 2 && allMatches.every(m => m.context === null)) {
              // Sort by position (textIndex)
              const sortedMatches = [...allMatches].sort((a, b) => a.textIndex - b.textIndex)
              if (info.context === 'company') {
                finalMatchingLabel = sortedMatches[0] // First Email = Company
                console.log(`Found Email label match using position order (first = company)`)
              } else if (info.context === 'investor') {
                finalMatchingLabel = sortedMatches[1] || sortedMatches[0] // Second Email = Investor
                console.log(`Found Email label match using position order (second = investor)`)
              }
            } else {
              // Try matching by context only (ignore position for Email)
              finalMatchingLabel = allMatches.find((label) => {
                if (label.context !== info.context) return false
                // Check if this label hasn't been replaced yet
                return !replacedPositions.has(label.xmlIndex)
              })
              if (finalMatchingLabel) {
                console.log(`Found Email label match using lenient context-only matching`)
              }
            }
          }
          
          if (finalMatchingLabel) {
            const replaceIndex = finalMatchingLabel.xmlIndex
            // Check if already replaced
            if (!replacedPositions.has(replaceIndex)) {
              // Find where the label ends (might be in XML tags)
              // Look for the end of the label text, accounting for XML tags
              let labelEndIndex = replaceIndex
              const escapedLabel = placeholderText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              const isEmailLabel = placeholderText.toLowerCase().includes('email')
              
              // Try multiple patterns to find the label
              let labelMatch = modifiedXml.substring(replaceIndex).match(new RegExp(`(<w:t[^>]*>${escapedLabel}</w:t>)`, 'i'))
              
              // For Email, try case-insensitive patterns and also try trimmed version
              if (!labelMatch && isEmailLabel) {
                labelMatch = modifiedXml.substring(replaceIndex).match(new RegExp(`(<w:t[^>]*>[Ee][Mm][Aa][Ii][Ll]:</w:t>)`, 'i'))
              }
              
              // Try with trimmed placeholder if original has whitespace
              if (!labelMatch) {
                const trimmedPlaceholder = placeholderText.trim()
                if (trimmedPlaceholder !== placeholderText) {
                  const escapedTrimmed = trimmedPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                  labelMatch = modifiedXml.substring(replaceIndex).match(new RegExp(`(<w:t[^>]*>${escapedTrimmed}</w:t>)`, 'i'))
                  if (!labelMatch && isEmailLabel) {
                    labelMatch = modifiedXml.substring(replaceIndex).match(new RegExp(`(<w:t[^>]*>[Ee][Mm][Aa][Ii][Ll]:</w:t>)`, 'i'))
                  }
                }
              }
              
              if (!labelMatch) {
                // Try pattern without strict tag matching
                labelMatch = modifiedXml.substring(replaceIndex).match(new RegExp(`(<w:t[^>]*>)?${placeholderText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(</w:t>)?`, 'i'))
              }
              
              // For Email, try one more case-insensitive flexible pattern
              if (!labelMatch && isEmailLabel) {
                labelMatch = modifiedXml.substring(replaceIndex).match(new RegExp(`(<w:t[^>]*>)?[Ee][Mm][Aa][Ii][Ll]:(</w:t>)?`, 'i'))
              }
              
              if (labelMatch) {
                // Label is in a <w:t> tag: <w:t>Email:</w:t>
                // Insert value before closing tag: <w:t>Email: value</w:t>
                labelEndIndex = replaceIndex + labelMatch[0].length
                if (labelMatch[0].endsWith('</w:t>')) {
                  const before = modifiedXml.substring(0, labelEndIndex - 6) // Before </w:t>
                  const after = modifiedXml.substring(labelEndIndex - 6)
                  modifiedXml = before + ' ' + escapedValue + after
                  if (isEmailField) {
                    console.log(`✓ Replaced Email label at index ${replaceIndex}, inserted value: "${escapedValue}"`)
                  }
                } else {
                  const before = modifiedXml.substring(0, labelEndIndex)
                  const after = modifiedXml.substring(labelEndIndex)
                  modifiedXml = before + ' ' + escapedValue + after
                  if (isEmailField) {
                    console.log(`✓ Replaced Email label (no closing tag) at index ${replaceIndex}, inserted value: "${escapedValue}"`)
                  }
                }
              } else {
                // Fallback: Try to find the label text directly and insert after it
                const textAfterIndex = modifiedXml.substring(replaceIndex, replaceIndex + 200)
                const searchPattern = isEmailLabel 
                  ? /[Ee][Mm][Aa][Ii][Ll]:/i
                  : new RegExp(escapedLabel.replace(/:/g, '.*:'), 'i')
                const labelInText = textAfterIndex.match(searchPattern)
                if (labelInText) {
                  const labelTextEnd = replaceIndex + labelInText.index! + labelInText[0].length
                  // Check if there's a closing tag right after
                  const afterLabel = modifiedXml.substring(labelTextEnd, labelTextEnd + 20)
                  if (afterLabel.trim().startsWith('</w:t>')) {
                    const before = modifiedXml.substring(0, labelTextEnd)
                    const after = modifiedXml.substring(labelTextEnd)
                    modifiedXml = before + ' ' + escapedValue + after
                    if (isEmailField) {
                      console.log(`✓ Replaced Email label (fallback) at index ${replaceIndex}, inserted value: "${escapedValue}"`)
                    }
                  } else {
                    const before = modifiedXml.substring(0, labelTextEnd)
                    const after = modifiedXml.substring(labelTextEnd)
                    modifiedXml = before + ' ' + escapedValue + after
                    if (isEmailField) {
                      console.log(`✓ Replaced Email label (fallback 2) at index ${replaceIndex}, inserted value: "${escapedValue}"`)
                    }
                  }
                } else {
                  // Last resort: simple string replacement
                  const before = modifiedXml.substring(0, replaceIndex)
                  const after = modifiedXml.substring(replaceIndex + placeholderText.length)
                  modifiedXml = before + placeholderText + ' ' + escapedValue + after
                  if (isEmailField) {
                    console.log(`✓ Replaced Email label (last resort) at index ${replaceIndex}, inserted value: "${escapedValue}"`)
                  }
                }
              }
              replacedPositions.add(replaceIndex)
            } else if (isEmailField) {
              console.log(`✗ Email label at index ${replaceIndex} already replaced, skipping`)
            }
          } else if (isEmailField) {
            console.log(`✗ Could not find matching Email label for ${key} with context ${info.context} and position ${info.position}`)
          } else {
            // Fallback: find by context marker
            const contextMarker = info.context === 'company' 
              ? /(?:\[COMPANY\]|COMPANY|COMPANY:)/gi
              : /(?:INVESTOR|INVESTOR:)/gi
            
            const markerRegex = new RegExp(contextMarker.source, 'gi')
            let markerMatch
            const contextMatches: Array<{ index: number; length: number }> = []
            
            while ((markerMatch = markerRegex.exec(modifiedXml)) !== null) {
              contextMatches.push({
                index: markerMatch.index,
                length: markerMatch[0].length
              })
            }
            
            // Find label after context marker using XML-aware search
            const labelMatches = findLabelInXml(modifiedXml, placeholderText)
            
            for (const labelMatch of labelMatches) {
              const labelIndex = labelMatch.xmlIndex
              if (replacedPositions.has(labelIndex)) continue
              
              // Check context by looking at plain text before label
              const plainBeforeText = modifiedXml.substring(Math.max(0, labelIndex - 3000), labelIndex).replace(/<[^>]+>/g, ' ').toLowerCase()
              const hasCompanyContext = (plainBeforeText.includes('company') && !plainBeforeText.includes('investor')) || 
                                       (plainBeforeText.lastIndexOf('company') > plainBeforeText.lastIndexOf('investor'))
              const hasInvestorContext = plainBeforeText.includes('investor') &&
                                        (plainBeforeText.lastIndexOf('investor') > plainBeforeText.lastIndexOf('company'))
              
              const matchesContext = (info.context === 'company' && hasCompanyContext) ||
                                   (info.context === 'investor' && hasInvestorContext)
              
              if (matchesContext) {
                // Check if already has a value (has been replaced)
                const afterXml = modifiedXml.substring(labelIndex, labelIndex + 200)
                const afterText = afterXml.replace(/<[^>]+>/g, ' ').substring(placeholderText.length).trim()
                if (!afterText || afterText.length === 0 || /^[_\s]*$/.test(afterText)) {
                  // Find where label ends in XML
                  const labelEndMatch = modifiedXml.substring(labelIndex).match(new RegExp(`(<w:t[^>]*>)?${placeholderText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(</w:t>)?`, 'i'))
                  
                  // For Email labels, try case-insensitive patterns
                  const isEmailLabel = placeholderText.toLowerCase().includes('email')
                  let finalMatch = labelEndMatch
                  
                  if (!finalMatch && isEmailLabel) {
                    finalMatch = modifiedXml.substring(labelIndex).match(new RegExp(`(<w:t[^>]*>)?[Ee][Mm][Aa][Ii][Ll]:(</w:t>)?`, 'i'))
                  }
                  
                  if (finalMatch) {
                    const labelEndIndex = labelIndex + finalMatch[0].length
                    if (finalMatch[0].endsWith('</w:t>')) {
                      const before = modifiedXml.substring(0, labelEndIndex - 6)
                      const after = modifiedXml.substring(labelEndIndex - 6)
                      modifiedXml = before + ' ' + escapedValue + after
                    } else {
                      const before = modifiedXml.substring(0, labelEndIndex)
                      const after = modifiedXml.substring(labelEndIndex)
                      modifiedXml = before + ' ' + escapedValue + after
                    }
                  } else {
                    // Fallback: find the actual text and insert after it
                    const textAfterIndex = modifiedXml.substring(labelIndex, labelIndex + 100)
                    const searchPattern = isEmailLabel 
                      ? /[Ee][Mm][Aa][Ii][Ll]:/i
                      : new RegExp(placeholderText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
                    const labelInText = textAfterIndex.match(searchPattern)
                    if (labelInText) {
                      const labelTextEnd = labelIndex + labelInText.index! + labelInText[0].length
                      const afterLabel = modifiedXml.substring(labelTextEnd, labelTextEnd + 20)
                      if (afterLabel.trim().startsWith('</w:t>')) {
                        const before = modifiedXml.substring(0, labelTextEnd)
                        const after = modifiedXml.substring(labelTextEnd)
                        modifiedXml = before + ' ' + escapedValue + after
                      } else {
                        const before = modifiedXml.substring(0, labelTextEnd)
                        const after = modifiedXml.substring(labelTextEnd)
                        modifiedXml = before + ' ' + escapedValue + after
                      }
                    } else {
                      const before = modifiedXml.substring(0, labelIndex)
                      const after = modifiedXml.substring(labelIndex + placeholderText.length)
                      modifiedXml = before + placeholderText + ' ' + escapedValue + after
                    }
                  }
                  replacedPositions.add(labelIndex)
                  break
                }
              }
            }
          }
        } else if (info.context) {
          // Has context but no position - use context-based search
          const contextMarker = info.context === 'company' 
            ? /(?:\[COMPANY\]|COMPANY|COMPANY:)/gi
            : /(?:INVESTOR|INVESTOR:)/gi
          
          const markerRegex = new RegExp(contextMarker.source, 'gi')
          let markerMatch
          const contextMatches: Array<{ index: number; length: number }> = []
          
          while ((markerMatch = markerRegex.exec(modifiedXml)) !== null) {
            contextMatches.push({
              index: markerMatch.index,
              length: markerMatch[0].length
            })
          }
          
          // Use XML-aware search
          const labelMatches = findLabelInXml(modifiedXml, placeholderText)
          let found = false
          
          for (const labelMatch of labelMatches) {
            const labelIndex = labelMatch.xmlIndex
            if (replacedPositions.has(labelIndex)) continue
            
            const plainBeforeText = modifiedXml.substring(Math.max(0, labelIndex - 3000), labelIndex).replace(/<[^>]+>/g, ' ').toLowerCase()
            const hasCompanyContext = plainBeforeText.includes('company') && 
                                     (plainBeforeText.lastIndexOf('company') > plainBeforeText.lastIndexOf('investor'))
            const hasInvestorContext = plainBeforeText.includes('investor') &&
                                      (plainBeforeText.lastIndexOf('investor') > plainBeforeText.lastIndexOf('company'))
            
            const matchesContext = (info.context === 'company' && hasCompanyContext) ||
                                 (info.context === 'investor' && hasInvestorContext)
            
            if (matchesContext) {
              const afterXml = modifiedXml.substring(labelIndex, labelIndex + 200)
              const afterText = afterXml.replace(/<[^>]+>/g, ' ').substring(placeholderText.length).trim()
              if (!afterText || afterText.length === 0 || /^[_\s]*$/.test(afterText)) {
                const labelEndMatch = modifiedXml.substring(labelIndex).match(new RegExp(`(<w:t[^>]*>)?${placeholderText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(</w:t>)?`, 'i'))
                
                // For Email labels, try case-insensitive patterns
                const isEmailLabel = placeholderText.toLowerCase().includes('email')
                let finalMatch = labelEndMatch
                
                if (!finalMatch && isEmailLabel) {
                  finalMatch = modifiedXml.substring(labelIndex).match(new RegExp(`(<w:t[^>]*>)?[Ee][Mm][Aa][Ii][Ll]:(</w:t>)?`, 'i'))
                }
                
                if (finalMatch) {
                  const labelEndIndex = labelIndex + finalMatch[0].length
                  if (finalMatch[0].endsWith('</w:t>')) {
                    const before = modifiedXml.substring(0, labelEndIndex - 6)
                    const after = modifiedXml.substring(labelEndIndex - 6)
                    modifiedXml = before + ' ' + escapedValue + after
                  } else {
                    const before = modifiedXml.substring(0, labelEndIndex)
                    const after = modifiedXml.substring(labelEndIndex)
                    modifiedXml = before + ' ' + escapedValue + after
                  }
                } else {
                  // Fallback: find the actual text and insert after it
                  const textAfterIndex = modifiedXml.substring(labelIndex, labelIndex + 100)
                  const searchPattern = isEmailLabel 
                    ? /[Ee][Mm][Aa][Ii][Ll]:/i
                    : new RegExp(placeholderText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
                  const labelInText = textAfterIndex.match(searchPattern)
                  if (labelInText) {
                    const labelTextEnd = labelIndex + labelInText.index! + labelInText[0].length
                    const afterLabel = modifiedXml.substring(labelTextEnd, labelTextEnd + 20)
                    if (afterLabel.trim().startsWith('</w:t>')) {
                      const before = modifiedXml.substring(0, labelTextEnd)
                      const after = modifiedXml.substring(labelTextEnd)
                      modifiedXml = before + ' ' + escapedValue + after
                    } else {
                      const before = modifiedXml.substring(0, labelTextEnd)
                      const after = modifiedXml.substring(labelTextEnd)
                      modifiedXml = before + ' ' + escapedValue + after
                    }
                  } else {
                    const before = modifiedXml.substring(0, labelIndex)
                    const after = modifiedXml.substring(labelIndex + placeholderText.length)
                    modifiedXml = before + placeholderText + ' ' + escapedValue + after
                  }
                }
                replacedPositions.add(labelIndex)
                found = true
                break
              }
            }
          }
        } else {
          // No context, use XML-aware search to find first occurrence
          const labelMatches = findLabelInXml(modifiedXml, placeholderText)
          if (labelMatches.length > 0) {
            const firstMatch = labelMatches[0]
            const labelIndex = firstMatch.xmlIndex
            if (!replacedPositions.has(labelIndex)) {
              const labelEndMatch = modifiedXml.substring(labelIndex).match(new RegExp(`(<w:t[^>]*>)?${placeholderText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(</w:t>)?`, 'i'))
              
              // For Email labels, try case-insensitive patterns
              const isEmailLabel = placeholderText.toLowerCase().includes('email')
              let finalMatch = labelEndMatch
              
              if (!finalMatch && isEmailLabel) {
                finalMatch = modifiedXml.substring(labelIndex).match(new RegExp(`(<w:t[^>]*>)?[Ee][Mm][Aa][Ii][Ll]:(</w:t>)?`, 'i'))
              }
              
              if (finalMatch) {
                const labelEndIndex = labelIndex + finalMatch[0].length
                if (finalMatch[0].endsWith('</w:t>')) {
                  const before = modifiedXml.substring(0, labelEndIndex - 6)
                  const after = modifiedXml.substring(labelEndIndex - 6)
                  modifiedXml = before + ' ' + escapedValue + after
                } else {
                  const before = modifiedXml.substring(0, labelEndIndex)
                  const after = modifiedXml.substring(labelEndIndex)
                  modifiedXml = before + ' ' + escapedValue + after
                }
              } else {
                // Fallback: find the actual text and insert after it
                const textAfterIndex = modifiedXml.substring(labelIndex, labelIndex + 100)
                const searchPattern = isEmailLabel 
                  ? /[Ee][Mm][Aa][Ii][Ll]:/i
                  : new RegExp(placeholderText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
                const labelInText = textAfterIndex.match(searchPattern)
                if (labelInText) {
                  const labelTextEnd = labelIndex + labelInText.index! + labelInText[0].length
                  const afterLabel = modifiedXml.substring(labelTextEnd, labelTextEnd + 20)
                  if (afterLabel.trim().startsWith('</w:t>')) {
                    const before = modifiedXml.substring(0, labelTextEnd)
                    const after = modifiedXml.substring(labelTextEnd)
                    modifiedXml = before + ' ' + escapedValue + after
                  } else {
                    const before = modifiedXml.substring(0, labelTextEnd)
                    const after = modifiedXml.substring(labelTextEnd)
                    modifiedXml = before + ' ' + escapedValue + after
                  }
                } else {
                  const before = modifiedXml.substring(0, labelIndex)
                  const after = modifiedXml.substring(labelIndex + placeholderText.length)
                  modifiedXml = before + placeholderText + ' ' + escapedValue + after
                }
              }
              replacedPositions.add(labelIndex)
            }
          }
        }
      })
      
      // Process other fields
      otherFields.forEach(({ key, data: placeholderData }) => {
        const { info, value } = placeholderData
        
        // Format the value - preserve prefix if it exists
        let formattedValue = value
        if (info.prefix && !value.startsWith(info.prefix)) {
          formattedValue = info.prefix + value.replace(/^\$/, '')
        }
        
        // Escape XML special characters in the replacement value
        const escapedValue = formattedValue
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
        
        const placeholderText = info.originalFormat
        
        // Standard placeholder replacement
        {
          // Create a regex that matches the placeholder even if characters are separated by XML tags
          // Example: [Company Name] might appear as <w:t>[Company</w:t><w:t> Name]</w:t>
          const chars = placeholderText.split('')
          const regexPattern = chars
            .map((char, idx) => {
              const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              if (idx === 0) return escapedChar
              // Allow zero or more XML tags between characters
              return `(?:<[^>]*>)*${escapedChar}`
            })
            .join('')
          
          try {
            const regex = new RegExp(regexPattern, 'g')
            modifiedXml = modifiedXml.replace(regex, () => {
              // Replace with the value, preserving any XML structure around it
              return escapedValue
            })
          } catch (e) {
            console.warn('Regex replacement failed, trying simpler approach:', e)
          }
          
          // Also try simple replacement for cases where placeholder is not split
          const simplePattern = placeholderText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          modifiedXml = modifiedXml.replace(new RegExp(simplePattern, 'g'), escapedValue)
        }
        
        // Replace normalized versions
        const displayKey = key.replace(/_\d+$/, '')
        
        // Special handling for Company Name - also replace [COMPANY]
        if (displayKey === 'Company Name') {
          // Replace [COMPANY] format in XML (handle XML tags that might split it)
          const companyPattern = /\[COMPANY\]/gi
          modifiedXml = modifiedXml.replace(companyPattern, escapedValue)
        }
        
        const patterns = [
          `[${displayKey}]`,
          `{${displayKey}}`,
          `{{${displayKey}}}`,
          `<<${displayKey}>>`,
        ]
        
        patterns.forEach(pattern => {
          const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          try {
            const patternRegex = new RegExp(escapedPattern, 'g')
            modifiedXml = modifiedXml.replace(patternRegex, escapedValue)
          } catch (e) {
            // Skip if regex fails
          }
        })
      })
      
      // Clean up trailing empty paragraphs and whitespace that might create extra lines
      // Find the last closing </w:body> tag
      const bodyEndIndex = modifiedXml.lastIndexOf('</w:body>')
      if (bodyEndIndex > 0) {
        const beforeBody = modifiedXml.substring(0, bodyEndIndex)
        const afterBody = modifiedXml.substring(bodyEndIndex)
        
        // Remove trailing empty paragraphs (multiple patterns)
        let cleanedBeforeBody = beforeBody
          // Remove empty paragraphs with only properties
          .replace(/(<w:p[^>]*>\s*<w:pPr[^>]*>.*?<\/w:pPr>\s*<\/w:p>\s*)+$/i, '')
          // Remove empty paragraphs with only empty text runs
          .replace(/(<w:p[^>]*>\s*<w:r>\s*<w:t[^>]*>\s*<\/w:t>\s*<\/w:r>\s*<\/w:p>\s*)+$/i, '')
          // Remove empty paragraphs with whitespace-only text
          .replace(/(<w:p[^>]*>\s*<w:r>\s*<w:t[^>]*>\s+<\/w:t>\s*<\/w:r>\s*<\/w:p>\s*)+$/i, '')
          // Remove completely empty paragraphs
          .replace(/(<w:p[^>]*>\s*<\/w:p>\s*)+$/i, '')
          // Remove paragraphs with only tabs/spaces
          .replace(/(<w:p[^>]*>\s*<w:r>\s*<w:t[^>]*>[\t\s]+<\/w:t>\s*<\/w:r>\s*<\/w:p>\s*)+$/i, '')
        
        modifiedXml = cleanedBeforeBody + afterBody
      }
      
      // Also remove any trailing empty paragraphs before closing body tag as a final cleanup
      modifiedXml = modifiedXml.replace(/(<w:p[^>]*>\s*<\/w:p>\s*)+<\/w:body>/i, '</w:body>')
      
      // Update the XML in the zip
      zip.file('word/document.xml', modifiedXml)
      
      // Generate the output blob
      const blob = zip.generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })

      saveAs(blob, 'completed-document.docx')
    } catch (error) {
      console.error('Error generating document:', error)
      alert('Error generating document. Make sure all placeholders are filled correctly.')
    }
  }

  return (
    <div className="bg-gray-50 dark:bg-black rounded-lg p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Completed Document
        </h2>
        <button
          onClick={handleDownload}
          className="px-4 py-2 bg-gray-900 dark:bg-black hover:bg-gray-800 dark:hover:bg-gray-900 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download .docx
        </button>
      </div>

      <div
        ref={contentRef}
        className="bg-white dark:bg-gray-950 rounded-lg p-6 border border-gray-200 dark:border-gray-900 min-h-[400px] max-h-[600px] overflow-y-auto prose dark:prose-invert max-w-none"
      >
        {formatContent(content)}
      </div>

      {filledData && filledData.size > 0 && (
        <div className="bg-white dark:bg-gray-950 rounded-lg p-4 border border-gray-200 dark:border-gray-900">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Replacement Summary
          </h3>
          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
            <p>Total replacements: {filledData.size}</p>
            <p className="text-gray-500 dark:text-gray-500">
              All placeholders have been replaced with provided values.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
