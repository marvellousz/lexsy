import Groq from 'groq-sdk'

if (!process.env.GROQ_API_KEY) {
  throw new Error('GROQ_API_KEY environment variable is not set. Please add it to your .env.local file.')
}

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

export async function POST(request: Request) {
  try {
    const { messages, placeholder, documentContext, mode } = await request.json()

    // Build system prompt for the AI
    let systemPrompt = ''
    
    if (mode === 'extract') {
      // Mode for extracting/processing user responses
      systemPrompt = `You are a helpful assistant helping to fill out a legal document (SAFE agreement).
Your job is to extract and format information from user responses to fill in placeholders.

Context about the document:
- This is a SAFE (Simple Agreement for Future Equity) document
- Extract the relevant value from user responses
- Format currency values properly (e.g., "100k" → "$100,000", "5M" → "$5,000,000")
- Format dates properly (e.g., "Oct 31 2025" → "October 31, 2025")
- If user provides multiple pieces of information, extract ONLY the value for the current placeholder: ${placeholder || 'N/A'}
- Be conversational - acknowledge the input naturally
- IMPORTANT: Do NOT ask for the next field or mention "Next, I'll need" - just acknowledge the value extraction

Current placeholder being filled: ${placeholder || 'N/A'}

${documentContext ? `Document context: ${documentContext}` : ''}

Respond naturally and conversationally. Extract the value and format it correctly. Only acknowledge the extraction, do not ask for more information.`
    } else {
      // Mode for generating prompts/questions
      systemPrompt = `You are a helpful assistant helping to fill out a legal document (SAFE agreement). 
Your job is to ask clear, specific questions about placeholders in the document.

IMPORTANT RULES:
- You MUST ask about the CURRENT placeholder only: "${placeholder || 'N/A'}"
- DO NOT ask meta-questions like "Is there anything else?" or "Would you like to review?"
- DO NOT ask wrap-up questions or completion questions
- Ask ONLY about the specific placeholder field mentioned above
- Be direct and specific - ask what value is needed for this exact field

Context about the document:
- This is a SAFE (Simple Agreement for Future Equity) document
- You need to extract information from user responses to fill in placeholders
- Be conversational and helpful, but stay focused on the current field
- Format currency values properly (e.g., "100k" should be understood as $100,000)
- Format dates properly (e.g., "October 31, 2025")

Current placeholder being filled: ${placeholder || 'N/A'}

${documentContext ? `Document context: ${documentContext}` : ''}

Ask ONLY about "${placeholder || 'N/A'}". Do not ask about other fields or completion status.`
    }

    // Ensure messages are properly formatted
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((msg: any) => ({
        role: msg.role || 'user',
        content: typeof msg.content === 'string' ? msg.content : msg.message || String(msg.content || msg.message),
      })),
    ]

    console.log('Sending to Groq:', {
      model: 'llama-3.3-70b-versatile',
      messageCount: formattedMessages.length,
      firstMessage: formattedMessages[0],
      lastMessage: formattedMessages[formattedMessages.length - 1],
    })

    const completion = await groq.chat.completions.create({
      messages: formattedMessages,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: mode === 'extract' ? 512 : 256,
    })

    // Debug logging
    console.log('Groq API completion:', JSON.stringify(completion, null, 2))
    console.log('Choices count:', completion.choices?.length)
    console.log('First choice:', completion.choices?.[0])
    console.log('Message content:', completion.choices?.[0]?.message?.content)

    const response = completion.choices?.[0]?.message?.content

    if (!response || response.trim() === '') {
      console.warn('Empty response from Groq API, using fallback')
      return Response.json({ 
        response: null,
        error: 'Empty response from AI model',
        fallback: true 
      })
    }

    return Response.json({ response })
  } catch (error: any) {
    console.error('Groq API error:', error)
    
    // Return more detailed error information for debugging
    const errorMessage = error?.error?.message || error?.message || 'Failed to get AI response'
    const errorCode = error?.error?.code || error?.code || 'unknown_error'
    
    return Response.json(
      { 
        error: errorMessage,
        code: errorCode,
        details: error?.error || error
      },
      { status: 500 }
    )
  }
}

