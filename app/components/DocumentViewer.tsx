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
      
      filledData.forEach((placeholderData, key) => {
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
        
        // For label-based fields (like "Address:"), append value after the label
        const isLabelField = placeholderText.endsWith(':') && !placeholderText.includes('[')
        
        if (isLabelField) {
          // For label fields, we need to replace only the correct instance based on context
          if (info.context) {
            // Find the specific instance based on context marker
            const contextMarker = info.context === 'company' 
              ? /(?:\[COMPANY\]|COMPANY)/gi
              : /(?:INVESTOR|INVESTOR:)/gi
            
            let found = false
            let lastReplaceIndex = 0
            
            modifiedXml = modifiedXml.replace(new RegExp(contextMarker.source, 'gi'), (match: string, offset: number) => {
              // After finding context marker, look for the label within reasonable distance
              const searchStart = offset + match.length
              const searchEnd = Math.min(modifiedXml.length, searchStart + 1000)
              const sectionXml = modifiedXml.substring(searchStart, searchEnd)
              
              if (!found && info.context === (match.toLowerCase().includes('company') ? 'company' : 'investor')) {
                // Look for the label in this section
                const labelPattern = placeholderText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const labelIndex = sectionXml.search(new RegExp(labelPattern))
                
                if (labelIndex >= 0) {
                  const absoluteIndex = searchStart + labelIndex
                  // Replace this specific instance
                  const before = modifiedXml.substring(0, absoluteIndex)
                  const after = modifiedXml.substring(absoluteIndex + placeholderText.length)
                  modifiedXml = before + placeholderText + ' ' + escapedValue + after
                  found = true
                  lastReplaceIndex = absoluteIndex + placeholderText.length + escapedValue.length + 1
                }
              }
              
              return match
            })
            
            // If we didn't find a match, fall back to first occurrence
            if (!found) {
              const firstIndex = modifiedXml.indexOf(placeholderText)
              if (firstIndex >= 0) {
                modifiedXml = modifiedXml.substring(0, firstIndex) + 
                             placeholderText + ' ' + escapedValue + 
                             modifiedXml.substring(firstIndex + placeholderText.length)
              }
            }
          } else {
            // No context, replace first occurrence
            const labelPattern = placeholderText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            modifiedXml = modifiedXml.replace(new RegExp(labelPattern), (match: string) => {
              return match + ' ' + escapedValue
            })
          }
        } else {
          // Standard placeholder replacement
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
