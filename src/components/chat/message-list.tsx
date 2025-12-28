'use client'

import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  TrendingUp,
  User,
  FileText,
  ExternalLink,
  FileSpreadsheet,
  Image as ImageIcon,
  BarChart3,
  Table2,
  Download,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Message } from '@/types/database'
import ReactMarkdown from 'react-markdown'
import { DocumentViewer } from './document-viewer'

export interface Citation {
  documentId: string
  documentName: string
  pageNumber?: number
  excerpt: string
  storagePath?: string
}

export interface CanvasContent {
  type: 'chart' | 'table' | 'spreadsheet' | 'image' | 'export'
  data: any
  loading?: boolean
  error?: string
}

interface ExtendedMessage extends Message {
  isStreaming?: boolean
  streamingContent?: string
}

interface MessageListProps {
  messages: ExtendedMessage[]
  isLoading?: boolean
  onCanvasClick?: (canvas: CanvasContent) => void
}

export function MessageList({
  messages,
  isLoading = false,
  onCanvasClick,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null)
  const [citationViewerOpen, setCitationViewerOpen] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleCitationClick = (citation: Citation) => {
    setSelectedCitation(citation)
    setCitationViewerOpen(true)
  }

  const getFileIcon = (name: string) => {
    if (name?.includes('.pdf')) return FileText
    if (name?.includes('.xlsx') || name?.includes('.csv') || name?.includes('.xls')) return FileSpreadsheet
    if (name?.includes('.png') || name?.includes('.jpg') || name?.includes('.jpeg')) return ImageIcon
    return FileText
  }

  const renderCitations = (citations: Citation[]) => {
    if (!citations || citations.length === 0) return null

    return (
      <div className="mt-4 space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Sources ({citations.length})
        </p>
        <div className="flex flex-wrap gap-2">
          {citations.map((citation, index) => {
            const FileIcon = getFileIcon(citation.documentName)
            return (
              <button
                key={`${citation.documentId}-${index}`}
                onClick={() => handleCitationClick(citation)}
                className="group inline-flex items-center gap-2 px-3 py-2 text-sm bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 text-blue-700 dark:text-blue-300 rounded-lg border border-blue-200 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md transition-all duration-200"
              >
                <div className="p-1 bg-blue-100 dark:bg-blue-900 rounded">
                  <FileIcon className="h-3.5 w-3.5" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="font-medium truncate max-w-[200px]">
                    {citation.documentName}
                  </span>
                  {citation.pageNumber && (
                    <span className="text-xs text-blue-500 dark:text-blue-400">
                      Page {citation.pageNumber}
                    </span>
                  )}
                </div>
                <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )
          })}
        </div>
        {citations.length > 0 && citations[0].excerpt && (
          <div className="mt-2 p-3 bg-muted/50 rounded-lg border border-border/50">
            <p className="text-xs text-muted-foreground italic line-clamp-2">
              "{citations[0].excerpt}"
            </p>
          </div>
        )}
      </div>
    )
  }

  const renderCanvas = (canvas: CanvasContent) => {
    if (!canvas) return null

    const canvasConfig = {
      chart: {
        icon: BarChart3,
        label: 'Chart',
        gradient: 'from-blue-500 to-indigo-600',
        bgGradient: 'from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30',
        borderColor: 'border-blue-200 dark:border-blue-800',
      },
      table: {
        icon: Table2,
        label: 'Data Table',
        gradient: 'from-emerald-500 to-teal-600',
        bgGradient: 'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30',
        borderColor: 'border-emerald-200 dark:border-emerald-800',
      },
      spreadsheet: {
        icon: FileSpreadsheet,
        label: 'Spreadsheet',
        gradient: 'from-green-500 to-emerald-600',
        bgGradient: 'from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30',
        borderColor: 'border-green-200 dark:border-green-800',
      },
      image: {
        icon: Sparkles,
        label: 'AI Visualization',
        gradient: 'from-purple-500 to-pink-600',
        bgGradient: 'from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30',
        borderColor: 'border-purple-200 dark:border-purple-800',
      },
      export: {
        icon: Download,
        label: 'Export Ready',
        gradient: 'from-orange-500 to-amber-600',
        bgGradient: 'from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30',
        borderColor: 'border-orange-200 dark:border-orange-800',
      },
    }

    const config = canvasConfig[canvas.type] || canvasConfig.chart
    const Icon = config.icon

    // Get preview data
    const data = canvas.data as any
    const title = data?.title || data?.data?.title || `${config.label}`
    const isLoading = canvas.loading

    return (
      <button
        onClick={() => onCanvasClick?.(canvas)}
        className={cn(
          'mt-4 w-full p-4 rounded-xl border transition-all duration-300 group',
          'hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]',
          `bg-gradient-to-br ${config.bgGradient}`,
          config.borderColor
        )}
      >
        <div className="flex items-center gap-4">
          <div className={cn(
            'p-3 rounded-xl bg-gradient-to-br text-white shadow-lg transition-transform group-hover:scale-110',
            config.gradient
          )}>
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Icon className="h-5 w-5" />
            )}
          </div>
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                {title}
              </span>
              {isLoading && (
                <Badge variant="secondary" className="text-xs animate-pulse">
                  Generating...
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-medium">
                {config.label}
              </Badge>
              {canvas.type === 'chart' && data?.data?.chartType && (
                <span className="text-xs text-muted-foreground capitalize">
                  {data.data.chartType} • {data.data.data?.length || 0} points
                </span>
              )}
              {canvas.type === 'table' && data?.data?.rows && (
                <span className="text-xs text-muted-foreground">
                  {data.data.rows.length} rows
                </span>
              )}
              {canvas.type === 'image' && (
                <span className="text-xs text-muted-foreground">
                  AI Generated
                </span>
              )}
            </div>
          </div>
          <div className="text-muted-foreground group-hover:text-primary transition-colors">
            <ExternalLink className="h-4 w-4" />
          </div>
        </div>

        {/* Visual preview indicator */}
        <div className="mt-3 h-2 bg-white/50 dark:bg-black/20 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full bg-gradient-to-r transition-all duration-500',
              config.gradient,
              isLoading ? 'w-1/2 animate-pulse' : 'w-full'
            )}
          />
        </div>
      </button>
    )
  }

  const renderToolIndicator = (message: ExtendedMessage) => {
    const toolCalls = message.tool_calls as any[] | undefined
    if (!toolCalls || toolCalls.length === 0) return null

    return (
      <div className="mt-2 flex flex-wrap gap-1">
        {toolCalls.map((tool, index) => (
          <Badge key={index} variant="outline" className="text-xs">
            {formatToolName(tool.name || tool.tool)}
          </Badge>
        ))}
      </div>
    )
  }

  const formatToolName = (name: string): string => {
    if (!name) return 'Tool'
    return name
      .replace('mcp__finance-tools__', '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
  }

  return (
    <>
      <div className="flex-1 overflow-hidden relative" ref={scrollRef}>
        <ScrollArea className="h-full">
          <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
          {messages.map((message, index) => {
            const isUser = message.role === 'user'
            const displayContent = message.isStreaming
              ? message.streamingContent
              : message.content
            const citations = message.citations as unknown as Citation[] | undefined
            const canvas = message.canvas_content as unknown as CanvasContent | undefined

            return (
              <div
                key={message.id || index}
                className={cn(
                  'flex gap-4',
                  isUser ? 'justify-end' : 'justify-start'
                )}
              >
                {!isUser && (
                  <Avatar className="h-9 w-9 shrink-0 ring-2 ring-primary/20">
                    <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
                      <TrendingUp className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}

                <div
                  className={cn(
                    'flex flex-col max-w-[85%]',
                    isUser ? 'items-end' : 'items-start'
                  )}
                >
                  <div
                    className={cn(
                      'rounded-2xl px-4 py-3',
                      isUser
                        ? 'bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-lg'
                        : 'bg-muted/80 shadow-sm'
                    )}
                  >
                    {isUser ? (
                      <p className="text-sm whitespace-pre-wrap">{displayContent}</p>
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-li:my-0.5">
                        <ReactMarkdown>{displayContent || ''}</ReactMarkdown>
                      </div>
                    )}

                    {message.isStreaming && (
                      <span className="inline-flex items-center gap-1 mt-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="text-xs opacity-70">Thinking...</span>
                      </span>
                    )}
                  </div>

                  {!isUser && renderToolIndicator(message)}
                  {!isUser && citations && renderCitations(citations)}
                  {!isUser && canvas && renderCanvas(canvas)}
                </div>

                {isUser && (
                  <Avatar className="h-9 w-9 shrink-0 ring-2 ring-slate-200 dark:ring-slate-700">
                    <AvatarFallback className="bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800">
                      <User className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            )
          })}

          {isLoading && (
            <div className="flex gap-4">
              <Avatar className="h-9 w-9 shrink-0 ring-2 ring-primary/20">
                <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
                  <TrendingUp className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="space-y-3 flex-1 max-w-[85%]">
                <div className="bg-muted/80 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Analyzing your request...</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    <Skeleton className="h-4 w-[90%]" />
                    <Skeleton className="h-4 w-[75%]" />
                    <Skeleton className="h-4 w-[60%]" />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </div>

      {/* Document Viewer Modal */}
      <DocumentViewer
        citation={selectedCitation}
        open={citationViewerOpen}
        onOpenChange={setCitationViewerOpen}
      />
    </>
  )
}
