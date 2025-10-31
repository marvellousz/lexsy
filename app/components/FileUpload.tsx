'use client'

import { useCallback, useState } from 'react'
import mammoth from 'mammoth'
import { PlaceholderInfo } from '../types/placeholders'

interface FileUploadProps {
  onDocumentParsed: (content: string, placeholders: Map<string, PlaceholderInfo>, fileBuffer: ArrayBuffer) => void
}

export default function FileUpload({ onDocumentParsed }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const extractPlaceholders = (text: string): Map<string, PlaceholderInfo> => {
    const placeholders = new Map<string, PlaceholderInfo>()
    const seenFormats = new Set<string>()
    const currencyBlanks: Array<{ match: RegExpMatchArray; context: string }> = []
    
    const patterns: Array<{ regex: RegExp; type: PlaceholderInfo['type']; prefix?: string }> = [
      { regex: /\{\{([^}]+)\}\}/g, type: 'double-curly' },
      { regex: /<<([^>]+)>>/g, type: 'angle' },
      { regex: /\[([^\]]+)\]/g, type: 'square' },
      { regex: /\{([^}]+)\}/g, type: 'curly' },
    ]

    // First pass: detect currency blanks separately to handle context
    const currencyRegex = /\$\[([_ ]+)\]/g
    let currencyMatch
    while ((currencyMatch = currencyRegex.exec(text)) !== null) {
      const originalFormat = currencyMatch[0]
      const startPos = Math.max(0, currencyMatch.index - 100)
      const endPos = Math.min(text.length, currencyMatch.index + currencyMatch[0].length + 100)
      const context = text.substring(startPos, endPos).toLowerCase()
      
      currencyBlanks.push({
        match: currencyMatch,
        context: context
      })
    }

    // Process currency blanks with context detection - deduplicate by context
    const purchaseAmountSeen = new Set<string>()
    const valuationCapSeen = new Set<string>()
    
    currencyBlanks.forEach(({ match, context }) => {
      const originalFormat = match[0]
      let normalizedKey = 'Purchase Amount'
      
      // Detect context to differentiate currency blanks
      if (context.includes('valuation') || context.includes('cap') || context.includes('post-money')) {
        normalizedKey = 'Post-Money Valuation Cap'
        if (!valuationCapSeen.has(originalFormat)) {
          valuationCapSeen.add(originalFormat)
          placeholders.set(normalizedKey, {
            key: normalizedKey,
            originalFormat: originalFormat,
            prefix: '$',
            type: 'currency-blank',
          })
        }
      } else if (context.includes('purchase') || context.includes('investment') || context.includes('amount')) {
        normalizedKey = 'Purchase Amount'
        if (!purchaseAmountSeen.has(originalFormat)) {
          purchaseAmountSeen.add(originalFormat)
          placeholders.set(normalizedKey, {
            key: normalizedKey,
            originalFormat: originalFormat,
            prefix: '$',
            type: 'currency-blank',
          })
        }
      } else {
        // Fallback: assign based on order
        if (purchaseAmountSeen.size === 0) {
          purchaseAmountSeen.add(originalFormat)
          placeholders.set('Purchase Amount', {
            key: 'Purchase Amount',
            originalFormat: originalFormat,
            prefix: '$',
            type: 'currency-blank',
          })
        } else if (valuationCapSeen.size === 0) {
          valuationCapSeen.add(originalFormat)
          placeholders.set('Post-Money Valuation Cap', {
            key: 'Post-Money Valuation Cap',
            originalFormat: originalFormat,
            prefix: '$',
            type: 'currency-blank',
          })
        }
      }
    })

    // Second pass: detect other placeholder formats
    patterns.forEach(({ regex, type, prefix = '' }) => {
      let match: RegExpExecArray | null
      regex.lastIndex = 0
      while ((match = regex.exec(text)) !== null) {
        const originalFormat = match[0]
        const key = match[1].trim()
        
        // Skip blank/underscore-only placeholders
        if (/^[_ ]+$/.test(key)) {
          continue
        }
        
        if (seenFormats.has(originalFormat)) continue
        seenFormats.add(originalFormat)
        
        let normalizedKey = key.replace(/\s+/g, ' ').trim()
        
        if (!normalizedKey || normalizedKey.length === 0) {
          continue
        }
        
        // Handle special cases: [name], [title], [COMPANY] in signature blocks
        const lowerKey = normalizedKey.toLowerCase()
        
        // Check if this is in a signature block by looking for signature markers
        const checkSignatureContext = () => {
          const startPos = Math.max(0, match!.index - 1000)
          const endPos = Math.min(text.length, match!.index + match![0].length + 500)
          const surroundingText = text.substring(startPos, endPos)
          
          // Look for signature block markers
          const hasCompanyMarker = /\[COMPANY\]|COMPANY:|^COMPANY\s*$/gim.test(surroundingText)
          const hasInvestorMarker = /INVESTOR:|^INVESTOR\s*$/gim.test(surroundingText)
          const hasByMarker = /by:\s*$/gim.test(surroundingText)
          const hasWitness = /in witness/gim.test(surroundingText)
          
          return {
            isInSignatureBlock: hasCompanyMarker || hasInvestorMarker || hasByMarker || hasWitness,
            hasCompanyMarker,
            hasInvestorMarker,
            beforeText: text.substring(startPos, match!.index).toLowerCase()
          }
        }
        
        const sigContext = checkSignatureContext()
        
        // Handle [COMPANY] placeholder - link it to main company name
        if (normalizedKey === 'COMPANY' && sigContext.isInSignatureBlock) {
          // Normalize to Company Name so it reuses the same value
          normalizedKey = 'Company Name'
          // Don't skip duplicates - we want to replace all instances of [COMPANY] with the same value
        }
        
        // Check if [name] or [title] appears in signature block context
        if ((lowerKey === 'name' || lowerKey === 'title') && sigContext.isInSignatureBlock) {
          // Determine if it's company or investor based on context
          // Check which marker is closer
          const beforeText = sigContext.beforeText
          const companyIndex = beforeText.lastIndexOf('company')
          const investorIndex = beforeText.lastIndexOf('investor')
          
          let isCompany = false
          if (companyIndex > investorIndex && companyIndex >= 0) {
            isCompany = true
          } else if (investorIndex >= 0 && investorIndex > companyIndex) {
            isCompany = false
          } else {
            // Fallback: check if [COMPANY] marker appears before this
            isCompany = sigContext.hasCompanyMarker && !sigContext.hasInvestorMarker
          }
          
          if (isCompany) {
            normalizedKey = lowerKey === 'name' ? 'Company Name Field' : 'Company Title'
          } else {
            normalizedKey = lowerKey === 'name' ? 'Investor Name' : 'Investor Title'
          }
        }
        
        // For [COMPANY], always add it (even if Company Name exists) so we can replace both formats
        // For other placeholders, skip if we already have this exact normalized key
        if (normalizedKey !== 'Company Name' || originalFormat !== '[COMPANY]') {
          const existing = placeholders.get(normalizedKey)
          if (existing) {
            // If same placeholder appears multiple times, we'll use the same key
            // (deduplication happens in replacement)
            continue
          }
        }
        
        placeholders.set(normalizedKey, {
          key: normalizedKey,
          originalFormat: originalFormat,
          prefix: prefix,
          type: type,
        })
      }
    })

    // Third pass: detect label-based fields (Address:, Email:, Name:, Title:)
    // These appear as labels followed by blank lines in signature blocks
    const labelFields = [
      { pattern: /\bAddress:\s*$/gim, label: 'Address' },
      { pattern: /\bEmail:\s*$/gim, label: 'Email' },
      { pattern: /\bName:\s*$/gim, label: 'Name' },
      { pattern: /\bTitle:\s*$/gim, label: 'Title' },
    ]

    // Detect signature block context - look for COMPANY and INVESTOR sections
    // Enhanced regex to catch more variations including standalone INVESTOR
    const signatureBlockRegex = /(?:\[COMPANY\]|COMPANY|COMPANY:|INVESTOR|INVESTOR:|\[INVESTOR\]|^INVESTOR\s*$)/gim
    let signatureMatches: Array<{ index: number; type: 'company' | 'investor'; text: string }> = []
    let match
    while ((match = signatureBlockRegex.exec(text)) !== null) {
      const matchText = match[0].toLowerCase()
      const isCompany = matchText.includes('company')
      signatureMatches.push({
        index: match.index,
        type: isCompany ? 'company' : 'investor',
        text: match[0]
      })
    }
    
    // Sort by index to process in order
    signatureMatches.sort((a, b) => a.index - b.index)
    
    // Debug logging
    console.log('Signature markers found:', signatureMatches.map(s => ({ type: s.type, text: s.text.substring(0, 20), index: s.index })))

    // Track which fields we've seen for each context
    const companyFields = new Set<string>()
    const investorFields = new Set<string>()

    labelFields.forEach(({ pattern, label }) => {
      let fieldMatch
      pattern.lastIndex = 0
      const allMatches: Array<{ index: number; text: string }> = []
      
      while ((fieldMatch = pattern.exec(text)) !== null) {
        allMatches.push({ index: fieldMatch.index, text: fieldMatch[0] })
      }
      
      console.log(`Found ${label} labels:`, allMatches.length, allMatches.map(m => ({ index: m.index, text: m.text.substring(0, 30) })))
      
      // Find the last company signature and last investor signature
      const lastCompanySignature = signatureMatches.filter(s => s.type === 'company').pop()
      const lastInvestorSignature = signatureMatches.filter(s => s.type === 'investor').pop()
      
      allMatches.forEach(({ index: labelIndex, text: labelText }) => {
        // Find ALL signatures within reasonable distance - increased range for signature blocks
        const nearbySignatures = signatureMatches.filter(sig => {
          const distance = Math.abs(sig.index - labelIndex)
          return distance < 3000 // Increased range for signature blocks which can span multiple lines
        })
        
        let context: 'company' | 'investor' | null = null
        
        if (nearbySignatures.length > 0) {
          // Find the closest signature marker BEFORE this label
          const beforeSignatures = nearbySignatures.filter(sig => sig.index < labelIndex)
          
          if (beforeSignatures.length > 0) {
            // Find the closest signature marker before this label
            const closestSignature = beforeSignatures.reduce((closest, current) => {
              const closestDist = Math.abs(closest.index - labelIndex)
              const currentDist = Math.abs(current.index - labelIndex)
              return currentDist < closestDist ? current : closest
            })
            
            context = closestSignature.type
          } else {
            // No signature before, check if label is after a signature
            // Find the closest signature marker (which will be after the label)
            const closestSignature = nearbySignatures.reduce((closest, current) => {
              const closestDist = Math.abs(closest.index - labelIndex)
              const currentDist = Math.abs(current.index - labelIndex)
              return currentDist < closestDist ? current : closest
            })
            
            // If label is very close after a signature, it belongs to that signature
            if (labelIndex < closestSignature.index + 500) {
              context = closestSignature.type
            }
          }
        }
        
        // Fallback: if no nearby signature, use position relative to last signatures
        if (!context) {
          if (lastCompanySignature && lastInvestorSignature) {
            // If label is after company signature but before investor signature, it's company
            // If label is after investor signature, it's investor
            if (labelIndex > lastInvestorSignature.index) {
              context = 'investor'
            } else if (labelIndex > lastCompanySignature.index && labelIndex < lastInvestorSignature.index) {
              context = 'company'
            } else if (labelIndex > lastCompanySignature.index - 500 && labelIndex < lastCompanySignature.index + 3000) {
              // Also check if label is near the company signature (within 500 chars before or 3000 after)
              context = 'company'
            }
          } else if (lastInvestorSignature && labelIndex > lastInvestorSignature.index - 500 && labelIndex < lastInvestorSignature.index + 3000) {
            context = 'investor'
          } else if (lastCompanySignature && labelIndex > lastCompanySignature.index - 500 && labelIndex < lastCompanySignature.index + 3000) {
            context = 'company'
          }
        }
        
        if (context) {
          const trimmedLabelText = labelText.trim()
          
          // Create unique key based on context and label
          let uniqueKey: string
          if (context === 'company') {
            uniqueKey = label === 'Address' ? 'Company Address' : 
                       label === 'Email' ? 'Company Email' :
                       label === 'Name' ? 'Company Name Field' :
                       label === 'Title' ? 'Company Title' : label
            
            // Check if we already have this exact key (same label, same context)
            // But allow if it's a different instance (different position)
            const existing = placeholders.get(uniqueKey)
            if (!existing || existing.position !== labelIndex) {
              companyFields.add(uniqueKey)
              placeholders.set(uniqueKey, {
                key: uniqueKey,
                originalFormat: trimmedLabelText,
                prefix: '',
                type: 'square',
                context: 'company',
                position: labelIndex,
              })
              console.log(`Added Company field: ${uniqueKey} at index ${labelIndex}`)
            } else {
              console.log(`Skipping duplicate Company field: ${uniqueKey} at index ${labelIndex}`)
            }
          } else {
            // Investor context
            uniqueKey = label === 'Address' ? 'Investor Address' :
                       label === 'Email' ? 'Investor Email' :
                       label === 'Name' ? 'Investor Name' :
                       label === 'Title' ? 'Investor Title' : label
            
            // Check if we already have this exact key (same label, same context)
            // But allow if it's a different instance (different position)
            const existing = placeholders.get(uniqueKey)
            if (!existing || existing.position !== labelIndex) {
              investorFields.add(uniqueKey)
              placeholders.set(uniqueKey, {
                key: uniqueKey,
                originalFormat: trimmedLabelText,
                prefix: '',
                type: 'square',
                context: 'investor',
                position: labelIndex,
              })
              console.log(`Added Investor field: ${uniqueKey} at index ${labelIndex}`)
            } else {
              console.log(`Skipping duplicate Investor field: ${uniqueKey} at index ${labelIndex}`)
            }
          }
        } else {
          console.log(`Could not determine context for ${label} at index ${labelIndex}`)
          // Debug: show what signatures were found
          console.log(`  Nearby signatures:`, nearbySignatures)
          console.log(`  Last company signature:`, lastCompanySignature)
          console.log(`  Last investor signature:`, lastInvestorSignature)
        }
      })
    })

    return placeholders
  }

  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.docx')) {
      alert('Please upload a .docx file')
      return
    }

    setIsProcessing(true)

    try {
      const arrayBuffer = await file.arrayBuffer()
      // Use raw text extraction for placeholder detection
      const rawTextResult = await mammoth.extractRawText({ arrayBuffer })
      const content = rawTextResult.value

      const placeholders = extractPlaceholders(content)
      
      // Debug: Log detected placeholders
      console.log('Detected placeholders:', Array.from(placeholders.keys()))
      console.log('Total count:', placeholders.size)
      
      if (placeholders.size === 0) {
        alert('No placeholders found in the document. Make sure your document contains placeholders like [Name], {Name}, {{Name}}, or <<Name>>')
      } else {
        onDocumentParsed(content, placeholders, arrayBuffer)
      }
    } catch (error) {
      console.error('Error processing file:', error)
      alert('Error processing file. Please make sure it is a valid .docx file.')
    } finally {
      setIsProcessing(false)
    }
  }, [onDocumentParsed])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      processFile(file)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processFile(file)
    }
  }

  const getClassName = () => {
    const baseClasses = 'border-2 border-dashed rounded-lg p-12 text-center transition-colors'
    const dragClasses = isDragging 
      ? 'border-gray-500 dark:border-gray-700 bg-gray-50 dark:bg-gray-950' 
      : 'border-gray-300 dark:border-gray-800 bg-gray-50 dark:bg-gray-950'
    const processingClasses = isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
    return `${baseClasses} ${dragClasses} ${processingClasses}`
  }

  return (
    <div
      className={getClassName()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept=".docx"
        onChange={handleFileInput}
        disabled={isProcessing}
        className="hidden"
        id="file-upload"
      />
      <label htmlFor="file-upload" className="cursor-pointer">
        {isProcessing ? (
          <div className="space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-500 dark:border-gray-400 mx-auto"></div>
            <p className="text-gray-600 dark:text-gray-400">Processing document...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <svg
              className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <div>
              <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
                Drop your .docx file here
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                or click to browse
              </p>
            </div>
          </div>
        )}
      </label>
    </div>
  )
}
