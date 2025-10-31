'use client'

import { useState, useEffect, useMemo } from 'react'
import { PlaceholderInfo, PlaceholderData } from '../types/placeholders'

interface DocumentProcessorProps {
  documentContent: string
  placeholders: Map<string, PlaceholderInfo>
  fileBuffer: ArrayBuffer
  onDocumentCompleted: (completedContent: string, filledData: Map<string, PlaceholderData>, fileBuffer: ArrayBuffer) => void
}

// Generate contextual prompts using AI (Groq) or fallback to rule-based
const generatePrompt = async (
  placeholder: PlaceholderInfo,
  conversationHistory: Array<{ role: 'user' | 'assistant', message: string }>,
  documentContext?: string
): Promise<string> => {
  // Remove suffix like "_0", "_1" for display purposes
  const displayKey = placeholder.key.replace(/_\d+$/, '')
  
  try {
    // Try to use AI for more natural prompts
    const response = await fetch('/api/groq', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.message,
        })),
        placeholder: displayKey,
        documentContext: documentContext || 'Legal document (SAFE agreement)',
        mode: 'prompt',
      }),
    })

    if (response.ok) {
      const data = await response.json()
      if (data.error || data.fallback || !data.response) {
        console.warn('AI API returned error or empty response:', data.error || 'Empty response')
        throw new Error(data.error || 'Empty response')
      }
      
      // Validate that the AI response is asking about the placeholder, not a meta-question
      const aiResponse = data.response.toLowerCase()
      const displayKey = placeholder.key.replace(/_\d+$/, '').toLowerCase()
      const isMetaQuestion = aiResponse.includes('is there anything else') ||
                            aiResponse.includes('would you like to review') ||
                            aiResponse.includes('would you like to continue') ||
                            aiResponse.includes('anything else you\'d like') ||
                            aiResponse.includes('or would you like me to review')
      
      if (isMetaQuestion) {
        console.warn('AI returned meta-question instead of asking about placeholder, using fallback')
        throw new Error('Meta-question detected')
      }
      
      return data.response || generateFallbackPrompt(placeholder)
    } else {
      const errorData = await response.json().catch(() => ({}))
      console.warn('AI prompt generation failed:', errorData.error || errorData.message || 'Unknown error')
      throw new Error(errorData.error || errorData.message || 'API request failed')
    }
  } catch (error) {
    console.warn('AI prompt generation failed, using fallback:', error)
  }

  // Fallback to rule-based prompts
  return generateFallbackPrompt(placeholder)
}

// Process user response with AI to extract and format value
const processUserResponse = async (
  userInput: string,
  placeholder: PlaceholderInfo,
  conversationHistory: Array<{ role: 'user' | 'assistant', message: string }>,
  documentContext?: string
): Promise<{ extractedValue: string; aiResponse?: string }> => {
  const displayKey = placeholder.key.replace(/_\d+$/, '')
  
  try {
    // Use AI to process the response
    const response = await fetch('/api/groq', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          ...conversationHistory.map(msg => ({
            role: msg.role,
            content: msg.message,
          })),
          {
            role: 'user',
            content: userInput,
          },
        ],
        placeholder: displayKey,
        documentContext: documentContext || 'Legal document (SAFE agreement)',
        mode: 'extract',
      }),
    })

    if (response.ok) {
      const data = await response.json()
      if (data.error || data.fallback || !data.response) {
        console.warn('AI API returned error or empty response:', data.error || 'Empty response')
        throw new Error(data.error || 'Empty response')
      }
      const aiResponse = data.response || ''
      
      // Try to extract the formatted value from AI response
      // AI should format it, but we'll also use our extractValue as fallback
      let extractedValue = extractValue(userInput, placeholder)
      
      // Try to extract formatted value from AI response
      if (aiResponse) {
        // Look for formatted currency/dates in AI response
        const currencyMatch = aiResponse.match(/\$[\d,]+/g)
        if (currencyMatch && placeholder.prefix === '$') {
          extractedValue = currencyMatch[0]
        }
        
        // Look for formatted dates
        const dateMatch = aiResponse.match(/(\w+\s+\d{1,2},?\s+\d{4})/i)
        if (dateMatch && placeholder.key.toLowerCase().includes('date')) {
          extractedValue = dateMatch[0]
        }
      }
      
      return { extractedValue, aiResponse }
    } else {
      const errorData = await response.json().catch(() => ({}))
      console.warn('AI response processing failed:', errorData.error || errorData.message || 'Unknown error')
      throw new Error(errorData.error || errorData.message || 'API request failed')
    }
  } catch (error) {
    console.warn('AI response processing failed, using fallback:', error)
  }

  // Fallback to rule-based extraction
  const extractedValue = extractValue(userInput, placeholder)
  return { extractedValue }
}

// Fallback rule-based prompt generation
const generateFallbackPrompt = (placeholder: PlaceholderInfo): string => {
  const displayKey = placeholder.key.replace(/_\d+$/, '')
  const key = displayKey.toLowerCase()
  
  if (key.includes('company') || key.includes('company name')) {
    return `What is the Company Name?`
  }
  if (displayKey === 'COMPANY') {
    return `What is the Company Name (for signature block)?`
  }
  if (key.includes('investor') || key.includes('investor name')) {
    return `What is the Investor's Name?`
  }
  if (key.includes('purchase') || key.includes('amount') || key.includes('value')) {
    return `What is the Purchase Amount (in USD)?`
  }
  if (key.includes('date') || key.includes('safe')) {
    return `On what Date was the SAFE executed?`
  }
  if (key.includes('state') || key.includes('incorporation')) {
    return `What is the State of Incorporation for the company?`
  }
  if (key.includes('valuation') || key.includes('cap')) {
    return `What is the Post-Money Valuation Cap?`
  }
  if (key.includes('governing') || key.includes('law') || key.includes('jurisdiction')) {
    return `Which State's laws will govern this agreement?`
  }
  if (key.includes('title') && key.includes('company')) {
    return `What is the Company Signatory's Title?`
  }
  if (key.includes('address') && key.includes('company')) {
    return `Please provide the Company Address.`
  }
  if (key.includes('email') && key.includes('company')) {
    return `Please provide the Company Email.`
  }
  if (key.includes('name') && key.includes('company') && key.includes('field')) {
    return `What is the Company Signatory's Name?`
  }
  if (key.includes('address') && key.includes('investor')) {
    return `What is the Investor's Address?`
  }
  if (key.includes('email') && key.includes('investor')) {
    return `What is the Investor's Email?`
  }
  if (key.includes('title') && key.includes('investor')) {
    return `What is the Investor's Title (if any)?`
  }
  if (key.includes('name') && key.includes('investor')) {
    return `What is the Investor's Name?`
  }
  
  return `I found a placeholder: "${displayKey}". What value should I use for this?`
}

// Intelligent value extraction from user responses
const extractValue = (input: string, placeholder: PlaceholderInfo): string => {
  let value = input.trim()
  
  // Handle currency amounts
  if (placeholder.prefix === '$' || placeholder.key.toLowerCase().includes('amount') || placeholder.key.toLowerCase().includes('valuation')) {
    // Extract number, handle formats like "100k", "100,000", "$100,000"
    const numberMatch = value.match(/[\d,]+(?:\.\d+)?(?:k|K|thousand|million|M)?/i)
    if (numberMatch) {
      let numStr = numberMatch[0].replace(/,/g, '')
      if (numStr.toLowerCase().includes('k')) {
        numStr = (parseFloat(numStr) * 1000).toString()
      } else if (numStr.toLowerCase().includes('m') || numStr.toLowerCase().includes('million')) {
        numStr = (parseFloat(numStr) * 1000000).toString()
      }
      // Format with commas
      value = '$' + parseFloat(numStr).toLocaleString('en-US')
    } else if (!value.startsWith('$')) {
      value = '$' + value
    }
  }
  
  // Handle dates - normalize formats
  if (placeholder.key.toLowerCase().includes('date')) {
    // Try to parse common date formats
    const dateMatch = value.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})|(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (dateMatch) {
      // Keep the original format if it's already well-formatted
      return value
    }
  }
  
  return value
}

export default function DocumentProcessor({
  documentContent,
  placeholders,
  fileBuffer,
  onDocumentCompleted,
}: DocumentProcessorProps) {
  const [filledPlaceholders, setFilledPlaceholders] = useState<Map<string, PlaceholderData>>(new Map())
  const [currentPlaceholderKey, setCurrentPlaceholderKey] = useState<string | null>(null)
  const [conversation, setConversation] = useState<Array<{ role: 'user' | 'assistant', message: string }>>([])
  const [inputValue, setInputValue] = useState('')
  const [skippedPlaceholders, setSkippedPlaceholders] = useState<Set<string>>(new Set())
  const [isAIThinking, setIsAIThinking] = useState(false)
  const [isFilledValuesOpen, setIsFilledValuesOpen] = useState(false)
  const [isRemainingPlaceholdersOpen, setIsRemainingPlaceholdersOpen] = useState(true)
  const [isConversationHistoryOpen, setIsConversationHistoryOpen] = useState(false)

  // Get sorted placeholder keys for better UX
  // Sort so company fields come before investor fields
  const placeholderKeys = useMemo(() => {
    const keys = Array.from(placeholders.keys())
    
    // Define field order within each section
    const fieldOrder = [
      // Company fields first
      'Company Name',
      'COMPANY',
      'Company Name Field',
      'Company Title',
      'Company Address',
      'Company Email',
      // Then investor fields
      'Investor Name',
      'Investor Title',
      'Investor Address',
      'Investor Email',
    ]
    
    // Sort keys: company fields first, then investor fields, then others
    return keys.sort((a, b) => {
      const aIsCompany = a.toLowerCase().includes('company') || a === 'COMPANY'
      const bIsCompany = b.toLowerCase().includes('company') || b === 'COMPANY'
      const aIsInvestor = a.toLowerCase().includes('investor')
      const bIsInvestor = b.toLowerCase().includes('investor')
      
      // Company fields come first
      if (aIsCompany && !bIsCompany) return -1
      if (!aIsCompany && bIsCompany) return 1
      
      // Investor fields come after company fields
      if (aIsInvestor && !bIsInvestor && !bIsCompany) return -1
      if (!aIsInvestor && bIsInvestor && !aIsCompany) return 1
      
      // Within same category, use field order
      const aIndex = fieldOrder.indexOf(a)
      const bIndex = fieldOrder.indexOf(b)
      
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex
      }
      if (aIndex !== -1) return -1
      if (bIndex !== -1) return 1
      
      // Default alphabetical for others
      return a.localeCompare(b)
    })
  }, [placeholders])

  useEffect(() => {
    // Initialize with first unfilled placeholder
    if (placeholderKeys.length > 0 && !currentPlaceholderKey && conversation.length === 0) {
      const firstUnfilled = placeholderKeys.find(key => !filledPlaceholders.has(key) && !skippedPlaceholders.has(key))
      if (firstUnfilled) {
        setCurrentPlaceholderKey(firstUnfilled)
        const placeholder = placeholders.get(firstUnfilled)!
        setIsAIThinking(true)
        generatePrompt(placeholder, [], documentContent.substring(0, 500)).then(prompt => {
          setConversation([{
            role: 'assistant',
            message: prompt
          }])
          setIsAIThinking(false)
        }).catch(() => {
          setConversation([{
            role: 'assistant',
            message: generateFallbackPrompt(placeholder)
          }])
          setIsAIThinking(false)
        })
      }
    }
  }, [placeholders, currentPlaceholderKey, placeholderKeys, filledPlaceholders, skippedPlaceholders, conversation.length, documentContent])

  const handleSubmit = async () => {
    if (!currentPlaceholderKey || !inputValue.trim() || isAIThinking) return

    const placeholder = placeholders.get(currentPlaceholderKey)!
    
    // Process user response with AI
    setIsAIThinking(true)
    const { extractedValue, aiResponse } = await processUserResponse(
      inputValue,
      placeholder,
      conversation,
      documentContent.substring(0, 500)
    )
    
    // Add user message
    const newConversation = [...conversation, {
      role: 'user' as const,
      message: inputValue
    }]

    // Add AI acknowledgment if available (clean it to remove "next question" hints)
    if (aiResponse) {
      // Remove "Next, I'll need..." hints that confuse the next prompt generation
      const cleanedResponse = aiResponse.split(/Next, I'll need|Next, I will need|Can you please provide|Would you like to continue/i)[0].trim()
      if (cleanedResponse) {
        newConversation.push({
          role: 'assistant',
          message: cleanedResponse
        })
      }
    }

    // Update filled placeholders
    const updated = new Map(filledPlaceholders)
    updated.set(currentPlaceholderKey, {
      info: placeholder,
      value: extractedValue
    })
    setFilledPlaceholders(updated)

    // Find next unfilled placeholder
    const nextPlaceholderKey = placeholderKeys.find(
      key => !updated.has(key) && !skippedPlaceholders.has(key) && key !== currentPlaceholderKey
    )

    if (nextPlaceholderKey) {
      const nextPlaceholder = placeholders.get(nextPlaceholderKey)!
      setCurrentPlaceholderKey(nextPlaceholderKey)
      try {
        // Only pass recent Q&A pairs (last 6 messages = 3 exchanges) to avoid confusing the AI with long history
        // Also filter out any wrap-up or meta messages
        const filteredHistory = newConversation.filter(msg => 
          !msg.message.includes('Is there anything else') &&
          !msg.message.includes('Would you like to review') &&
          !msg.message.includes('Next, I\'ll need') &&
          !msg.message.includes('Next, I will need') &&
          !msg.message.includes('Great! You\'ve filled')
        )
        // Take only the last 6 messages (3 Q&A pairs) to keep context focused
        const qaHistory = filteredHistory.slice(-6)
        const prompt = await generatePrompt(nextPlaceholder, qaHistory, documentContent.substring(0, 500))
        setConversation([...newConversation, {
          role: 'assistant',
          message: prompt
        }])
      } catch {
        setConversation([...newConversation, {
          role: 'assistant',
          message: generateFallbackPrompt(nextPlaceholder)
        }])
      }
    } else {
      setCurrentPlaceholderKey(null)
      const remainingCount = placeholderKeys.length - updated.size
      if (remainingCount > 0) {
        newConversation.push({
          role: 'assistant',
          message: `Great! You've filled ${updated.size} placeholder(s). We still have ${remainingCount} remaining. Would you like to continue?`
        })
      } else {
        newConversation.push({
          role: 'assistant',
          message: 'All placeholders have been filled! Generating your completed document...'
        })
        // Generate completed document
        setTimeout(() => generateCompletedDocument(updated), 500)
      }
      setConversation(newConversation)
    }

    setIsAIThinking(false)
    setInputValue('')
  }

  const handleSkip = async () => {
    if (!currentPlaceholderKey || isAIThinking) return

    setSkippedPlaceholders(prev => new Set([...prev, currentPlaceholderKey]))
    
    const newConversation = [...conversation, {
      role: 'user' as const,
      message: '[Skipped]'
    }]

    // Find next unfilled placeholder
    const nextPlaceholderKey = placeholderKeys.find(
      key => !filledPlaceholders.has(key) && !skippedPlaceholders.has(key) && key !== currentPlaceholderKey
    )

    if (nextPlaceholderKey) {
      const nextPlaceholder = placeholders.get(nextPlaceholderKey)!
      setCurrentPlaceholderKey(nextPlaceholderKey)
      setIsAIThinking(true)
      try {
        // Only pass recent Q&A pairs (last 6 messages = 3 exchanges) to avoid confusing the AI with long history
        // Also filter out any wrap-up or meta messages
        const filteredHistory = newConversation.filter(msg => 
          !msg.message.includes('Is there anything else') &&
          !msg.message.includes('Would you like to review') &&
          !msg.message.includes('Next, I\'ll need') &&
          !msg.message.includes('Next, I will need') &&
          !msg.message.includes('Great! You\'ve filled')
        )
        // Take only the last 6 messages (3 Q&A pairs) to keep context focused
        const qaHistory = filteredHistory.slice(-6)
        const prompt = await generatePrompt(nextPlaceholder, qaHistory, documentContent.substring(0, 500))
        setConversation([...newConversation, {
          role: 'assistant',
          message: `Skipped. ${prompt}`
        }])
      } catch {
        setConversation([...newConversation, {
          role: 'assistant',
          message: `Skipped. ${generateFallbackPrompt(nextPlaceholder)}`
        }])
      } finally {
        setIsAIThinking(false)
      }
    } else {
      setCurrentPlaceholderKey(null)
      const remainingCount = placeholderKeys.length - filledPlaceholders.size
      if (remainingCount > 0) {
        newConversation.push({
          role: 'assistant',
          message: `We still have ${remainingCount} placeholder(s) remaining. Would you like to continue?`
        })
      } else {
        newConversation.push({
          role: 'assistant',
          message: 'All placeholders have been processed! Generating your completed document...'
        })
        setTimeout(() => generateCompletedDocument(filledPlaceholders), 500)
      }
      setConversation(newConversation)
    }

    setInputValue('')
  }

  const handleFillSpecific = async (key: string) => {
    setCurrentPlaceholderKey(key)
    const placeholder = placeholders.get(key)!
    setIsAIThinking(true)
    try {
      const prompt = await generatePrompt(placeholder, conversation, documentContent.substring(0, 500))
      setConversation(prev => [...prev, {
        role: 'assistant',
        message: prompt
      }])
    } catch {
      setConversation(prev => [...prev, {
        role: 'assistant',
        message: generateFallbackPrompt(placeholder)
      }])
    } finally {
      setIsAIThinking(false)
    }
  }

  const generateCompletedDocument = (filled: Map<string, PlaceholderData>) => {
    let completed = documentContent

    // Group placeholders by originalFormat to handle duplicates correctly
    const formatGroups = new Map<string, Array<{ key: string; data: PlaceholderData }>>()
    
    filled.forEach((data, key) => {
      const format = data.info.originalFormat
      if (!formatGroups.has(format)) {
        formatGroups.set(format, [])
      }
      formatGroups.get(format)!.push({ key, data })
    })

    // Replace placeholders, handling duplicates by replacing sequentially
    formatGroups.forEach((group, originalFormat) => {
      group.forEach(({ key, data }) => {
        const { info, value } = data
        
        // Format the value - preserve prefix if it exists
        let formattedValue = value
        if (info.prefix && !value.startsWith(info.prefix)) {
          formattedValue = info.prefix + value.replace(/^\$/, '')
        }
        
        // Replace first occurrence of this format (for duplicates, replace one at a time)
        // For label-based fields (like "Address:"), append value after the label
        if (originalFormat.endsWith(':') && !originalFormat.includes('[')) {
          // This is a label field - need to replace only the correct instance based on context
          if (info.context) {
            // Find the specific instance based on context
            // For Company context, find Address: that appears after [COMPANY] or COMPANY
            // For Investor context, find Address: that appears after INVESTOR
            const contextMarker = info.context === 'company' 
              ? /(?:\[COMPANY\]|COMPANY)/gi
              : /(?:INVESTOR|INVESTOR:)/gi
            
            // Find all context markers
            const contextMatches: Array<{ index: number; length: number }> = []
            let match
            const markerRegex = new RegExp(contextMarker.source, 'gi')
            while ((match = markerRegex.exec(completed)) !== null) {
              contextMatches.push({
                index: match.index,
                length: match[0].length
              })
            }
            
            // Find the label that belongs to this context
            const labelPattern = new RegExp(originalFormat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
            let labelMatch
            let found = false
            
            while ((labelMatch = labelPattern.exec(completed)) !== null && !found) {
              const labelIndex = labelMatch.index
              
              // Find the nearest context marker before this label
              const relevantContext = contextMatches.find(ctx => 
                labelIndex > ctx.index && 
                labelIndex < ctx.index + ctx.length + 500 &&
                ((info.context === 'company' && completed.substring(ctx.index, ctx.index + ctx.length).toLowerCase().includes('company')) ||
                 (info.context === 'investor' && completed.substring(ctx.index, ctx.index + ctx.length).toLowerCase().includes('investor')))
              )
              
              if (relevantContext) {
                // Replace this specific instance
                completed = completed.substring(0, labelIndex) + 
                           originalFormat + ' ' + formattedValue + 
                           completed.substring(labelIndex + originalFormat.length)
                found = true
              }
            }
            
            // If we didn't find a match, fall back to first occurrence
            if (!found) {
              const firstIndex = completed.indexOf(originalFormat)
              if (firstIndex >= 0) {
                completed = completed.substring(0, firstIndex) + 
                           originalFormat + ' ' + formattedValue + 
                           completed.substring(firstIndex + originalFormat.length)
              }
            }
          } else {
            // No context, just replace first occurrence
            const firstIndex = completed.indexOf(originalFormat)
            if (firstIndex >= 0) {
              completed = completed.substring(0, firstIndex) + 
                         originalFormat + ' ' + formattedValue + 
                         completed.substring(firstIndex + originalFormat.length)
            }
          }
        } else {
          // Standard placeholder replacement
          completed = completed.replace(originalFormat, formattedValue)
        }
        
        // Also handle normalized versions (but only for non-currency-blank types)
        if (info.type !== 'currency-blank') {
          const displayKey = key.replace(/_\d+$/, '')
          
          // Special handling for Company Name - also replace [COMPANY]
          if (displayKey === 'Company Name') {
            // Replace [COMPANY] format
            completed = completed.replace(/\[COMPANY\]/gi, formattedValue)
          }
          
          const normalizedPatterns = [
            `[${displayKey}]`,
            `{${displayKey}}`,
            `{{${displayKey}}}`,
            `<<${displayKey}>>`,
          ]
          
          normalizedPatterns.forEach(pattern => {
            try {
              const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              const regex = new RegExp(escapedPattern, 'gi')
              completed = completed.replace(regex, formattedValue)
            } catch (e) {
              // Skip if regex fails
            }
          })
        }
      })
    })

    onDocumentCompleted(completed, filled, fileBuffer)
  }

  const remainingCount = placeholderKeys.length - filledPlaceholders.size - skippedPlaceholders.size
  const isComplete = remainingCount === 0 && filledPlaceholders.size > 0

  return (
    <div className="bg-gray-50 dark:bg-black rounded-lg p-6 space-y-4">
      <div className="flex justify-end items-center">
        {remainingCount > 0 && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {remainingCount} remaining
          </span>
        )}
        {isComplete && (
          <span className="text-sm text-green-600 dark:text-green-400 font-medium">
            ✓ Complete
          </span>
        )}
      </div>

      {currentPlaceholderKey && (
        <div className="bg-white dark:bg-gray-950 rounded-lg p-6 border border-gray-200 dark:border-gray-900 space-y-4">
          {/* AI Question Display */}
          {conversation.length > 0 && conversation[conversation.length - 1].role === 'assistant' && (
            <div className="flex justify-start">
              <div className="max-w-[90%] rounded-lg px-5 py-4 bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white shadow-sm">
                <p className="text-base leading-relaxed whitespace-pre-wrap">
                  {conversation[conversation.length - 1].message}
                </p>
              </div>
            </div>
          )}

          {/* Input Section */}
          <div className="flex gap-3">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !isAIThinking && inputValue.trim()) handleSubmit()
                if (e.key === 'Escape' && !isAIThinking) handleSkip()
              }}
              placeholder="Type your answer here..."
              disabled={isAIThinking}
              className="flex-1 px-5 py-3 text-base border border-gray-300 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              autoFocus
            />
            <button
              onClick={handleSubmit}
              disabled={!inputValue.trim() || isAIThinking}
              className="px-6 py-3 bg-gray-900 dark:bg-black hover:bg-gray-800 dark:hover:bg-gray-900 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium text-base"
            >
              Submit
            </button>
            <button
              onClick={handleSkip}
              disabled={isAIThinking}
              className="px-5 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors disabled:opacity-50 font-medium text-base"
            >
              Skip
            </button>
          </div>
          
          {isAIThinking && (
            <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500 dark:border-gray-400"></div>
              AI is thinking...
            </div>
          )}
        </div>
      )}

      {!currentPlaceholderKey && remainingCount > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            Click on any placeholder below to fill it, or continue with the remaining ones.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {/* Conversation History */}
        {conversation.length > 1 && (
          <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-900">
            <button
              onClick={() => setIsConversationHistoryOpen(!isConversationHistoryOpen)}
              className="w-full p-4 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex justify-between items-center"
            >
              <span>Conversation History ({conversation.length - 1})</span>
              <svg 
                className={`w-5 h-5 transition-transform duration-200 ${isConversationHistoryOpen ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isConversationHistoryOpen && (
              <div className="p-4 pt-0 max-h-64 overflow-y-auto space-y-3">
                {conversation.slice(0, -1).map((item, index) => (
                  <div
                    key={index}
                    className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        item.role === 'user'
                          ? 'bg-gray-900 dark:bg-black text-white'
                          : 'bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{item.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Filled Values */}
        {filledPlaceholders.size > 0 && (
          <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-900">
            <button
              onClick={() => setIsFilledValuesOpen(!isFilledValuesOpen)}
              className="w-full p-4 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex justify-between items-center"
            >
              <span>Filled Values ({filledPlaceholders.size})</span>
              <svg 
                className={`w-5 h-5 transition-transform duration-200 ${isFilledValuesOpen ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isFilledValuesOpen && (
              <div className="p-4 pt-0 space-y-2 max-h-48 overflow-y-auto">
                {Array.from(filledPlaceholders.entries()).map(([key, data]) => (
                  <div key={key} className="text-sm flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <span className="font-medium text-gray-700 dark:text-gray-300">{key.replace(/_\d+$/, '')}:</span>{' '}
                      <span className="text-gray-600 dark:text-gray-400">{data.value}</span>
                    </div>
                    <button
                      onClick={() => handleFillSpecific(key)}
                      className="text-xs text-gray-900 dark:text-white hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Remaining Placeholders */}
        {remainingCount > 0 && (
          <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-900">
            <button
              onClick={() => setIsRemainingPlaceholdersOpen(!isRemainingPlaceholdersOpen)}
              className="w-full p-4 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex justify-between items-center"
            >
              <span>Remaining Placeholders ({remainingCount})</span>
              <svg 
                className={`w-5 h-5 transition-transform duration-200 ${isRemainingPlaceholdersOpen ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isRemainingPlaceholdersOpen && (
              <div className="p-4 pt-0 space-y-2 max-h-48 overflow-y-auto">
                {placeholderKeys
                  .filter(key => !filledPlaceholders.has(key) && !skippedPlaceholders.has(key))
                  .map(key => {
                    const placeholder = placeholders.get(key)!
                    return (
                      <button
                        key={key}
                        onClick={() => handleFillSpecific(key)}
                        className="w-full text-left text-sm p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-950 transition-colors"
                      >
                        <span className="font-medium text-gray-700 dark:text-gray-300">{key.replace(/_\d+$/, '')}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                          ({placeholder.originalFormat})
                        </span>
                      </button>
                    )
                  })}
              </div>
            )}
          </div>
        )}
      </div>

      {filledPlaceholders.size > 0 && remainingCount === 0 && (
        <button
          onClick={() => generateCompletedDocument(filledPlaceholders)}
          className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
        >
          Generate Completed Document
        </button>
      )}
    </div>
  )
}
