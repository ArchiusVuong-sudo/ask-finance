import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { streamFinanceChat, createToolContextAccumulator, type ChatMessage } from '@/lib/agents/finance-agent'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()

  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get user profile with role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // RBAC check for viewers
    if (profile.role === 'viewer') {
      // Viewers have read-only access - they can chat but can't export
    }

    // Parse request body
    const body = await request.json()
    const { message, threadId, sessionId } = body

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get or create thread
    let currentThreadId = threadId
    if (!currentThreadId) {
      // Create new thread
      const { data: newThread, error: threadError } = await supabase
        .from('threads')
        .insert({
          user_id: user.id,
          title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
        })
        .select()
        .single()

      if (threadError) {
        console.error('Error creating thread:', threadError)
        return new Response(
          JSON.stringify({ error: 'Failed to create thread' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }

      currentThreadId = newThread.id
    }

    // Context Management Strategy:
    // 1. Limit to last 6 message pairs (12 messages) to stay well under 200k token limit
    // 2. Truncate individual messages that are too long
    // 3. Prioritize recent context over older messages
    // 4. Keep ~50k tokens of conversation history to leave room for:
    //    - System prompt (~5k tokens)
    //    - Knowledge base context (~30k tokens)
    //    - Tool results and visualizations (~50k tokens)
    //    - New response generation (~10k tokens)
    const MAX_MESSAGES = 12 // 6 turns of conversation
    const MAX_MESSAGE_LENGTH = 4000 // ~1k tokens per message max
    const MAX_TOTAL_CONTENT_LENGTH = 50000 // ~12.5k tokens total for history

    const { data: previousMessages } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('thread_id', currentThreadId)
      .order('created_at', { ascending: false })
      .limit(MAX_MESSAGES)

    // Reverse to get chronological order
    const chronologicalMessages = (previousMessages || []).reverse()

    // Smart truncation: keep recent messages fuller, truncate older ones more aggressively
    let totalLength = 0
    const limitedMessages: ChatMessage[] = []

    for (let i = chronologicalMessages.length - 1; i >= 0; i--) {
      const m = chronologicalMessages[i]
      const isRecent = i >= chronologicalMessages.length - 4 // Last 2 turns get full content

      // Calculate allowed length based on position
      const allowedLength = isRecent ? MAX_MESSAGE_LENGTH : Math.floor(MAX_MESSAGE_LENGTH / 2)

      let content = m.content
      if (content.length > allowedLength) {
        content = content.substring(0, allowedLength) + '\n\n[Content summarized for context limit...]'
      }

      // Check if adding this message would exceed total limit
      if (totalLength + content.length > MAX_TOTAL_CONTENT_LENGTH && limitedMessages.length >= 2) {
        // Add a summary note and stop
        limitedMessages.unshift({
          role: 'assistant' as const,
          content: '[Earlier conversation history omitted to stay within context limits. Key points from the conversation are preserved in recent messages.]'
        })
        break
      }

      totalLength += content.length
      limitedMessages.unshift({
        role: m.role as 'user' | 'assistant',
        content
      })
    }

    // Build messages array
    const messages: ChatMessage[] = [
      ...limitedMessages,
      { role: 'user' as const, content: message },
    ]

    // Save user message
    await supabase.from('messages').insert({
      thread_id: currentThreadId,
      role: 'user',
      content: message,
    })

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = ''
        const citations: unknown[] = []
        const canvasContents: unknown[] = []  // Support multiple canvas items
        const toolCalls: unknown[] = []
        const toolContextAccumulator = createToolContextAccumulator()  // For multi-turn image generation

        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          )
        }

        // Send thread ID immediately
        sendEvent('thread', { threadId: currentThreadId })

        try {
          // Run the finance agent with callbacks
          await streamFinanceChat(
            messages,
            {
              onText: (text: string) => {
                fullResponse += text
                sendEvent('text', { content: text })
              },
              onToolStart: (tool: string, input: unknown) => {
                toolCalls.push({ name: tool, input })
                sendEvent('tool_start', { tool, input })
              },
              onToolResult: (tool: string, result: unknown) => {
                const lastToolCall = toolCalls[toolCalls.length - 1] as { output?: unknown } | undefined
                if (lastToolCall) {
                  lastToolCall.output = result
                }
                sendEvent('tool_result', { tool, result })

                // Check if result contains canvas data (chart, table, image, etc.)
                const resultObj = result as { type?: string; data?: unknown }
                if (resultObj?.type === 'chart' || resultObj?.type === 'table' || resultObj?.type === 'image') {
                  // The result already has {type, data} structure, use it directly
                  canvasContents.push(resultObj)
                  sendEvent('canvas', resultObj)
                }

                // Check for citations
                const citationResult = result as { citations?: unknown[] }
                if (citationResult?.citations) {
                  citations.push(...citationResult.citations)
                  sendEvent('citations', { citations: citationResult.citations })
                }
              },
              onError: (error: Error) => {
                sendEvent('error', { message: error.message })
              },
              onDone: () => {
                sendEvent('done', {
                  threadId: currentThreadId,
                  sessionId,
                })
              },
            },
            { sessionId, userId: user.id, toolContextAccumulator }
          )

          // Save assistant message
          if (fullResponse) {
            // Store the last canvas content (or first chart/table) for the message
            const primaryCanvas = canvasContents.length > 0 ? canvasContents[canvasContents.length - 1] : null

            await supabase.from('messages').insert({
              thread_id: currentThreadId,
              role: 'assistant' as const,
              content: fullResponse,
              citations: (citations.length > 0 ? citations : null) as any,
              canvas_content: primaryCanvas as any,
              tool_calls: (toolCalls.length > 0 ? toolCalls : null) as any,
            })

            // Update thread title if needed
            if (!threadId) {
              const titleContent = message.length > 60 ? message.substring(0, 57) + '...' : message
              await supabase
                .from('threads')
                .update({ title: titleContent })
                .eq('id', currentThreadId)
            }

            // Update thread's updated_at
            await supabase
              .from('threads')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', currentThreadId)
          }

          // Log usage
          await supabase.from('usage_logs').insert({
            user_id: user.id,
            action: 'chat_message',
            details: {
              threadId: currentThreadId,
              messageLength: message.length,
              responseLength: fullResponse.length,
              toolCallsCount: toolCalls.length,
              citationsCount: citations.length,
              hasCanvas: canvasContents.length > 0,
              userRole: profile.role,
            },
          })

        } catch (error) {
          console.error('Streaming error:', error)
          sendEvent('error', {
            message: error instanceof Error ? error.message : 'An error occurred'
          })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Thread-Id': currentThreadId,
      },
    })

  } catch (error) {
    console.error('Chat API error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
