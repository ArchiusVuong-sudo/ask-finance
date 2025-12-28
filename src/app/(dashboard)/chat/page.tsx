'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MessageList } from '@/components/chat/message-list'
import { MessageInput } from '@/components/chat/message-input'
import { Header } from '@/components/layout/header'
import { CanvasPanel, type CanvasContent } from '@/components/canvas/canvas-panel'
import type { Message } from '@/types/database'
import { TrendingUp, MessageSquarePlus, FileText, Calculator, BarChart3 } from 'lucide-react'

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [canvasOpen, setCanvasOpen] = useState(false)
  const [canvasContent, setCanvasContent] = useState<CanvasContent | null>(null)
  const [allCanvasItems, setAllCanvasItems] = useState<CanvasContent[]>([])
  const router = useRouter()

  const handleSend = useCallback(async (message: string, files?: File[]) => {
    // Add user message immediately
    const userMessage: Message = {
      id: crypto.randomUUID(),
      thread_id: '',
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
      thread_id: '',
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
        body: JSON.stringify({ message }),
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader available')

      const decoder = new TextDecoder()
      let buffer = ''
      let threadId = ''

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
                case 'thread':
                  threadId = data.threadId
                  break
                case 'text':
                  setMessages((prev) => {
                    const updated = [...prev]
                    const lastMsg = updated[updated.length - 1] as Message & { streamingContent?: string }
                    if (lastMsg.role === 'assistant') {
                      lastMsg.streamingContent = (lastMsg.streamingContent || '') + data.content
                    }
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
                    const updated = [...prev]
                    const lastMsg = updated[updated.length - 1]
                    if (lastMsg.role === 'assistant') {
                      lastMsg.canvas_content = canvasItem as unknown as typeof lastMsg.canvas_content
                    }
                    return updated
                  })
                  // Add to all canvas items
                  setAllCanvasItems((prev) => {
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
                    const updated = [...prev]
                    const lastMsg = updated[updated.length - 1]
                    if (lastMsg.role === 'assistant') {
                      lastMsg.citations = data.citations
                    }
                    return updated
                  })
                  break
                case 'done':
                  setMessages((prev) => {
                    const updated = [...prev]
                    const lastMsg = updated[updated.length - 1] as Message & { isStreaming?: boolean; streamingContent?: string }
                    if (lastMsg.role === 'assistant') {
                      lastMsg.content = lastMsg.streamingContent || ''
                      lastMsg.isStreaming = false
                      lastMsg.token_usage = data.usage
                    }
                    return updated
                  })
                  // Navigate to the thread
                  if (threadId) {
                    router.push(`/chat/${threadId}`)
                  }
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
  }, [router])

  const handleStop = useCallback(() => {
    // TODO: Implement stop functionality
    setIsStreaming(false)
  }, [])

  const suggestions = [
    {
      icon: Calculator,
      title: 'Analyze variance',
      description: 'Compare budget vs actual for Q4',
    },
    {
      icon: BarChart3,
      title: 'Create chart',
      description: 'Visualize revenue trends over time',
    },
    {
      icon: FileText,
      title: 'Search documents',
      description: 'Find information in your uploaded files',
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <Header
        onToggleCanvas={() => setCanvasOpen(!canvasOpen)}
        canvasOpen={canvasOpen}
      />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="p-4 bg-primary/10 rounded-full mb-6">
                <TrendingUp className="h-12 w-12 text-primary" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Welcome to Ask Finance</h1>
              <p className="text-muted-foreground text-center max-w-md mb-8">
                Your AI-powered financial assistant. Ask questions about your data,
                analyze trends, and generate insights.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl w-full">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSend(suggestion.description)}
                    className="flex flex-col items-start p-4 rounded-lg border bg-card hover:bg-muted transition-colors text-left"
                  >
                    <suggestion.icon className="h-5 w-5 text-primary mb-2" />
                    <span className="font-medium text-sm">{suggestion.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {suggestion.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <MessageList
              messages={messages}
              isLoading={isStreaming}
            />
          )}

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
          />
        )}
      </div>
    </div>
  )
}
