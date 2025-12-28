'use client'

import { useState, useEffect, useCallback, use, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MessageList } from '@/components/chat/message-list'
import { MessageInput } from '@/components/chat/message-input'
import { Header } from '@/components/layout/header'
import { CanvasPanel, type CanvasContent } from '@/components/canvas/canvas-panel'
import type { Message, Thread } from '@/types/database'
import { buildFeedbackMessage, type ImageFeedbackData } from '@/lib/agents/image-feedback-utils'

interface PageProps {
  params: Promise<{ threadId: string }>
}

export default function ThreadPage({ params }: PageProps) {
  const { threadId } = use(params)
  const [thread, setThread] = useState<Thread | null>(null)
  const [messages, setMessages] = useState<(Message & { isStreaming?: boolean; streamingContent?: string })[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [canvasOpen, setCanvasOpen] = useState(false)
  const [canvasContent, setCanvasContent] = useState<CanvasContent | null>(null)
  const [allCanvasItems, setAllCanvasItems] = useState<CanvasContent[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // Extract all canvas items from messages
  const canvasItemsFromMessages = useMemo(() => {
    const items: CanvasContent[] = []
    messages.forEach((msg) => {
      if (msg.canvas_content) {
        const canvas = msg.canvas_content as unknown as CanvasContent
        items.push({
          ...canvas,
          id: canvas.id || `msg-${msg.id}-canvas`,
          timestamp: msg.created_at || undefined,
        })
      }
    })
    return items
  }, [messages])

  // Load thread and messages
  useEffect(() => {
    const loadThread = async () => {
      const supabase = createClient()

      // Get thread
      const { data: threadData, error: threadError } = await supabase
        .from('threads')
        .select('*')
        .eq('id', threadId)
        .single()

      if (threadError || !threadData) {
        router.push('/chat')
        return
      }

      setThread(threadData)

      // Get messages
      const { data: messagesData } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })

      setMessages(messagesData || [])
      setLoading(false)

      // Collect all canvas items from loaded messages
      const canvasItems: CanvasContent[] = []
      if (messagesData) {
        messagesData.forEach((msg) => {
          if (msg.canvas_content) {
            const canvas = msg.canvas_content as unknown as CanvasContent
            canvasItems.push({
              ...canvas,
              id: canvas.id || `msg-${msg.id}-canvas`,
              timestamp: msg.created_at || undefined,
            })
          }
        })
      }
      setAllCanvasItems(canvasItems)

      // Check for canvas content - open panel if there are any items
      if (canvasItems.length > 0) {
        // Set the last item as the selected content
        setCanvasContent(canvasItems[canvasItems.length - 1])
        setCanvasOpen(true)
      }
    }

    loadThread()

    // Subscribe to new messages
    const supabase = createClient()
    const channel = supabase
      .channel(`thread-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === payload.new.id)) {
              return prev
            }
            return [...prev, payload.new as Message]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [threadId, router])

  const handleSend = useCallback(async (message: string, files?: File[]) => {
    // Add user message immediately
    const userMessage: Message = {
      id: crypto.randomUUID(),
      thread_id: threadId,
      role: 'user',
      content: message,
      tool_calls: [],
      citations: [],
      canvas_content: null,
      token_usage: null,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])
    setIsStreaming(true)

    // Add placeholder for assistant message
    const assistantMessage: Message & { isStreaming?: boolean; streamingContent?: string } = {
      id: crypto.randomUUID(),
      thread_id: threadId,
      role: 'assistant',
      content: '',
      tool_calls: [],
      citations: [],
      canvas_content: null,
      token_usage: null,
      created_at: new Date().toISOString(),
      isStreaming: true,
      streamingContent: '',
    }
    setMessages((prev) => [...prev, assistantMessage])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, message }),
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader available')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (line.startsWith('event: ')) {
            const event = line.slice(7)
            const dataLine = lines[i + 1]
            if (dataLine?.startsWith('data: ')) {
              const data = JSON.parse(dataLine.slice(6))
              i++ // Skip data line

              switch (event) {
                case 'text':
                  setMessages((prev) => {
                    // Create a new array reference to ensure React detects the change
                    const updated = prev.map((msg, idx) => {
                      if (idx === prev.length - 1 && msg.role === 'assistant') {
                        return {
                          ...msg,
                          streamingContent: (msg.streamingContent || '') + data.content
                        }
                      }
                      return msg
                    })
                    return updated
                  })
                  break
                case 'canvas':
                  // Create canvas item with unique ID
                  const canvasItem: CanvasContent = {
                    ...data,
                    id: data.id || `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: new Date().toISOString(),
                  }
                  setMessages((prev) => {
                    return prev.map((msg, idx) => {
                      if (idx === prev.length - 1 && msg.role === 'assistant') {
                        return { ...msg, canvas_content: canvasItem as unknown as typeof msg.canvas_content }
                      }
                      return msg
                    })
                  })
                  // Add to all canvas items
                  setAllCanvasItems((prev) => {
                    // Check if already exists (by ID or data match)
                    const exists = prev.some(item =>
                      item.id === canvasItem.id ||
                      JSON.stringify(item.data) === JSON.stringify(canvasItem.data)
                    )
                    if (exists) return prev
                    return [...prev, canvasItem]
                  })
                  setCanvasContent(canvasItem)
                  setCanvasOpen(true)
                  break
                case 'citations':
                  setMessages((prev) => {
                    return prev.map((msg, idx) => {
                      if (idx === prev.length - 1 && msg.role === 'assistant') {
                        return { ...msg, citations: data.citations }
                      }
                      return msg
                    })
                  })
                  break
                case 'done':
                  setMessages((prev) => {
                    return prev.map((msg, idx) => {
                      if (idx === prev.length - 1 && msg.role === 'assistant') {
                        const streamingMsg = msg as Message & { isStreaming?: boolean; streamingContent?: string }
                        return {
                          ...msg,
                          content: streamingMsg.streamingContent || '',
                          isStreaming: false,
                          token_usage: data.usage
                        }
                      }
                      return msg
                    })
                  })
                  break
                case 'error':
                  console.error('Stream error:', data.message)
                  break
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error)
      // Remove the failed assistant message
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setIsStreaming(false)
    }
  }, [threadId])

  const handleStop = useCallback(() => {
    // TODO: Implement stop functionality
    setIsStreaming(false)
  }, [])

  const handleCanvasClick = useCallback((canvas: CanvasContent) => {
    setCanvasContent(canvas)
    setCanvasOpen(true)
  }, [])

  // Handle image feedback from CanvasPanel
  const handleImageFeedback = useCallback((feedback: ImageFeedbackData) => {
    // Build the feedback message that the agent will understand
    const feedbackMessage = buildFeedbackMessage(feedback)
    // Send it as a new user message
    handleSend(feedbackMessage)
  }, [handleSend])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        thread={thread}
        onToggleCanvas={() => setCanvasOpen(!canvasOpen)}
        canvasOpen={canvasOpen}
      />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <MessageList
            messages={messages}
            isLoading={isStreaming}
            onCanvasClick={handleCanvasClick}
          />

          <MessageInput
            onSend={handleSend}
            onStop={handleStop}
            isStreaming={isStreaming}
          />
        </div>

        {/* Canvas Panel with Gallery */}
        {canvasOpen && (
          <CanvasPanel
            content={canvasContent}
            allItems={allCanvasItems}
            onClose={() => setCanvasOpen(false)}
            onSelectItem={(item) => setCanvasContent(item)}
            onImageFeedback={handleImageFeedback}
            isLoading={isStreaming}
          />
        )}
      </div>
    </div>
  )
}
