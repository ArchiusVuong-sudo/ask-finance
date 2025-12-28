'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  X,
  Download,
  Maximize2,
  Minimize2,
  RefreshCw,
  BarChart3,
  Table2,
  FileSpreadsheet,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  Layers,
  GalleryHorizontal,
  FileText,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DynamicChart } from './dynamic-chart'
import { DataTable } from './data-table'
import { ImageFeedback, type ImageFeedbackData } from './image-feedback'

// Fullscreen Image Viewer Component
function ImageViewer({
  src,
  alt,
  title
}: {
  src: string | null
  alt: string
  title?: string
}) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Handle Escape key to close fullscreen
  useEffect(() => {
    if (!isFullscreen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    // Prevent body scroll when fullscreen
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isFullscreen])

  if (!src) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4 p-8">
        <ImageIcon className="h-16 w-16 text-purple-500" />
        <p className="text-muted-foreground">Image preview not available</p>
      </div>
    )
  }

  return (
    <>
      {/* Normal view */}
      <div className="flex flex-col items-center justify-center h-full p-4">
        <div className="relative group cursor-pointer" onClick={() => setIsFullscreen(true)}>
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-lg transition-transform duration-200 group-hover:scale-[1.02]"
          />
          {/* Click to expand overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 text-white px-4 py-2 rounded-full flex items-center gap-2">
              <Maximize2 className="h-4 w-4" />
              <span className="text-sm font-medium">Click to expand</span>
            </div>
          </div>
        </div>
        {title && (
          <p className="mt-3 text-sm text-muted-foreground text-center">{title}</p>
        )}
      </div>

      {/* Fullscreen modal */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
          onClick={() => setIsFullscreen(false)}
        >
          {/* Close button */}
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white z-10"
            onClick={(e) => {
              e.stopPropagation()
              setIsFullscreen(false)
            }}
          >
            <X className="h-6 w-6" />
          </button>

          {/* Title */}
          {title && (
            <div className="absolute top-4 left-4 text-white z-10">
              <h3 className="text-lg font-medium">{title}</h3>
            </div>
          )}

          {/* Image container */}
          <div className="p-8 max-w-[95vw] max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={src}
              alt={alt}
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
          </div>

          {/* Instructions */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            Click anywhere or press Escape to close
          </div>
        </div>
      )}
    </>
  )
}

export interface CanvasContent {
  type: 'chart' | 'table' | 'spreadsheet' | 'image' | 'export'
  data: any
  loading?: boolean
  error?: string
  id?: string
  timestamp?: string
}

interface CanvasPanelProps {
  content: CanvasContent | null
  allItems?: CanvasContent[]
  onClose: () => void
  onExport?: (format: 'excel' | 'powerpoint' | 'image') => void
  onSelectItem?: (item: CanvasContent) => void
  onImageFeedback?: (feedback: ImageFeedbackData) => void
  isLoading?: boolean
}

const canvasConfig = {
  chart: {
    icon: BarChart3,
    title: 'Chart',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    gradient: 'from-emerald-500 to-teal-500',
  },
  table: {
    icon: Table2,
    title: 'Data Table',
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    gradient: 'from-blue-500 to-indigo-500',
  },
  spreadsheet: {
    icon: FileSpreadsheet,
    title: 'Spreadsheet',
    color: 'text-green-500',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    gradient: 'from-green-500 to-emerald-500',
  },
  image: {
    icon: ImageIcon,
    title: 'Generated Image',
    color: 'text-purple-500',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    gradient: 'from-purple-500 to-pink-500',
  },
  export: {
    icon: Download,
    title: 'Export',
    color: 'text-orange-500',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    gradient: 'from-orange-500 to-amber-500',
  },
}

// Thumbnail component for gallery view
function CanvasThumbnail({
  item,
  isActive,
  onClick
}: {
  item: CanvasContent
  isActive: boolean
  onClick: () => void
}) {
  const config = canvasConfig[item.type] || canvasConfig.chart
  const Icon = config.icon
  const title = item.data?.title || item.data?.data?.title || config.title

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all duration-200 min-w-[70px]',
        'hover:shadow-md hover:scale-105',
        isActive
          ? `border-transparent bg-gradient-to-br ${config.gradient} text-white shadow-md`
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
      )}
    >
      <div className={cn(
        'p-1.5 rounded-md',
        isActive ? 'bg-white/20' : config.bgColor
      )}>
        <Icon className={cn('h-4 w-4', isActive ? 'text-white' : config.color)} />
      </div>
      <span className={cn(
        'text-[10px] font-medium truncate max-w-[60px]',
        isActive ? 'text-white' : 'text-slate-600 dark:text-slate-300'
      )}>
        {title}
      </span>
    </button>
  )
}

// Content renderer component
function CanvasContentRenderer({
  content,
  onExport,
  isDownloading,
  onDownload,
  onImageFeedback,
  isLoadingFeedback,
}: {
  content: CanvasContent
  onExport?: (format: 'excel' | 'powerpoint' | 'image') => void
  isDownloading?: boolean
  onDownload?: (content: CanvasContent) => Promise<void>
  onImageFeedback?: (feedback: ImageFeedbackData) => void
  isLoadingFeedback?: boolean
}) {
  const config = canvasConfig[content.type] || canvasConfig.chart

  if (content.loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4 p-8">
        <div className={cn('p-4 rounded-full', config.bgColor)}>
          <Loader2 className={cn('h-8 w-8 animate-spin', config.color)} />
        </div>
        <div className="text-center">
          <p className="font-medium">Loading {config.title}...</p>
          <p className="text-sm text-muted-foreground mt-1">This may take a moment</p>
        </div>
        <div className="w-48 space-y-2">
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-3/4" />
          <Skeleton className="h-2 w-1/2" />
        </div>
      </div>
    )
  }

  if (content.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4 p-8">
        <div className="p-4 rounded-full bg-red-50 dark:bg-red-950/30">
          <AlertCircle className="h-8 w-8 text-red-500" />
        </div>
        <div className="text-center">
          <p className="font-medium text-red-600 dark:text-red-400">Failed to load content</p>
          <p className="text-sm text-muted-foreground mt-1">{content.error}</p>
        </div>
      </div>
    )
  }

  switch (content.type) {
    case 'chart':
      const chartData = content.data?.data || content.data
      return (
        <div className="p-3 h-full overflow-auto min-h-[300px]">
          <DynamicChart data={chartData} />
        </div>
      )

    case 'table':
      const tableData = content.data?.data || content.data
      return (
        <div className="p-3 h-full overflow-auto min-h-[200px]">
          <DataTable data={tableData} />
        </div>
      )

    case 'spreadsheet':
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4 p-8">
          <FileSpreadsheet className="h-16 w-16 text-green-500" />
          <p className="text-muted-foreground">Spreadsheet viewer coming soon</p>
          {content.data?.filename && (
            <Button variant="outline" onClick={() => onExport?.('excel')}>
              <Download className="h-4 w-4 mr-2" />
              Download {content.data.filename}
            </Button>
          )}
        </div>
      )

    case 'image':
      const imageData = content.data
      const imageSrc = imageData?.imageUrl ||
        (imageData?.imageData ? `data:${imageData.mimeType || 'image/png'};base64,${imageData.imageData}` : null)

      return (
        <div className="flex flex-col h-full">
          <div className="flex-1">
            <ImageViewer
              src={imageSrc}
              alt={imageData?.title || 'Generated image'}
              title={imageData?.title}
            />
          </div>
          {onImageFeedback && (
            <ImageFeedback
              imageId={imageData?.imageId || content.id || `img-${Date.now()}`}
              originalPrompt={imageData?.originalPrompt || imageData?.prompt}
              originalImageUrl={imageSrc || undefined}
              onFeedback={onImageFeedback}
              disabled={isLoadingFeedback}
            />
          )}
        </div>
      )

    case 'export':
      const exportData = content.data
      const isExcel = exportData?.format === 'excel' || exportData?.filename?.endsWith('.xlsx')
      const isPowerPoint = exportData?.format === 'powerpoint' || exportData?.filename?.endsWith('.pptx')
      const fileExtension = isExcel ? '.xlsx' : isPowerPoint ? '.pptx' : ''
      const fileIcon = isExcel ? FileSpreadsheet : isPowerPoint ? FileText : Download

      return (
        <div className="flex flex-col items-center justify-center h-full space-y-6 p-8">
          <div className="p-6 rounded-full bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30 relative">
            {React.createElement(fileIcon, { className: 'h-12 w-12 text-orange-500' })}
            {isDownloading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 rounded-full">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
              </div>
            )}
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold">
              {isDownloading ? 'Generating File...' : 'Export Ready'}
            </h3>
            <p className="text-muted-foreground mt-1">
              {exportData?.title || 'Your report is ready to download'}
            </p>
            {exportData?.sheets && (
              <p className="text-xs text-muted-foreground mt-2">
                {exportData.sheets.length} sheet{exportData.sheets.length !== 1 ? 's' : ''} • Excel format
              </p>
            )}
            {exportData?.slides && (
              <p className="text-xs text-muted-foreground mt-2">
                {exportData.slides.length} slide{exportData.slides.length !== 1 ? 's' : ''} • PowerPoint format
              </p>
            )}
          </div>
          <Button
            onClick={() => onDownload?.(content)}
            disabled={isDownloading}
            className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50"
            size="lg"
          >
            {isDownloading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download {exportData?.filename || `Report${fileExtension}`}
              </>
            )}
          </Button>
          {!isDownloading && (
            <p className="text-xs text-muted-foreground">
              Click to download the generated file
            </p>
          )}
        </div>
      )

    default:
      return (
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Unknown content type</p>
        </div>
      )
  }
}

export function CanvasPanel({ content, allItems = [], onClose, onExport, onSelectItem, onImageFeedback, isLoading }: CanvasPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isDownloading, setIsDownloading] = useState(false)

  // Handle file download
  const handleDownload = useCallback(async (exportContent: CanvasContent) => {
    if (exportContent.type !== 'export' || !exportContent.data) return

    const exportData = exportContent.data
    const isExcel = exportData?.format === 'excel' || exportData?.sheets
    const endpoint = isExcel ? '/api/export/excel' : '/api/export/powerpoint'

    setIsDownloading(true)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: exportData.title || 'Report',
          sheets: exportData.sheets,
          slides: exportData.slides,
          metadata: exportData.metadata,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to generate file')
      }

      // Get the blob and trigger download
      const blob = await response.blob()
      const filename = exportData.filename ||
        `${exportData.title || 'Report'}_${new Date().toISOString().split('T')[0]}${isExcel ? '.xlsx' : '.pptx'}`

      // Create download link
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      toast.success('File downloaded successfully', {
        description: filename,
      })
    } catch (error) {
      console.error('Download error:', error)
      toast.error('Failed to download file', {
        description: error instanceof Error ? error.message : 'Please try again',
      })
    } finally {
      setIsDownloading(false)
    }
  }, [])

  // Auto-select split view when there are multiple item types
  const hasMultipleTypes = useMemo(() => {
    const types = new Set(allItems.map(item => item.type))
    return types.size > 1
  }, [allItems])

  const [viewMode, setViewMode] = useState<'single' | 'gallery' | 'split'>(
    hasMultipleTypes && allItems.length > 1 ? 'split' : 'single'
  )

  // Combine current content with all items, removing duplicates
  const items = useMemo(() => {
    const combined: CanvasContent[] = []
    const seen = new Set<string>()

    // Add all items first
    allItems.forEach(item => {
      const id = item.id || JSON.stringify(item.data)
      if (!seen.has(id)) {
        seen.add(id)
        combined.push(item)
      }
    })

    // Add current content if not already present
    if (content) {
      const id = content.id || JSON.stringify(content.data)
      if (!seen.has(id)) {
        combined.push(content)
      }
    }

    return combined
  }, [content, allItems])

  // Group items by type
  const groupedItems = useMemo(() => {
    const groups: Record<string, CanvasContent[]> = {
      chart: [],
      table: [],
      image: [],
      other: [],
    }

    items.forEach(item => {
      if (item.type === 'chart') groups.chart.push(item)
      else if (item.type === 'table') groups.table.push(item)
      else if (item.type === 'image') groups.image.push(item)
      else groups.other.push(item)
    })

    return groups
  }, [items])

  // Find current item index when content changes
  useEffect(() => {
    if (content && items.length > 0) {
      const contentId = content.id || JSON.stringify(content.data)
      const idx = items.findIndex(item =>
        (item.id || JSON.stringify(item.data)) === contentId
      )
      if (idx !== -1) setSelectedIndex(idx)
    }
  }, [content, items])

  const currentItem = items[selectedIndex] || content

  if (!currentItem && items.length === 0) return null

  const config = currentItem ? canvasConfig[currentItem.type] || canvasConfig.chart : canvasConfig.chart
  const Icon = config.icon

  const handlePrev = () => {
    setSelectedIndex(prev => (prev > 0 ? prev - 1 : items.length - 1))
  }

  const handleNext = () => {
    setSelectedIndex(prev => (prev < items.length - 1 ? prev + 1 : 0))
  }

  const handleSelectItem = (item: CanvasContent, index: number) => {
    setSelectedIndex(index)
    onSelectItem?.(item)
  }

  return (
    <div
      className={cn(
        'flex flex-col border-l bg-background transition-all duration-300 shrink-0 overflow-hidden',
        isExpanded
          ? 'w-full absolute inset-0 z-50'
          : viewMode === 'split'
            ? 'w-[55vw] min-w-[400px] max-w-[1200px]'
            : 'w-[400px] min-w-[320px]'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={cn('p-1.5 rounded-lg shrink-0', config.bgColor)}>
            <Icon className={cn('h-4 w-4', config.color)} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-medium text-sm truncate">{config.title}</h3>
              {items.length > 1 && (
                <Badge variant="secondary" className="text-xs shrink-0">
                  {selectedIndex + 1}/{items.length}
                </Badge>
              )}
            </div>
            {currentItem?.data?.title && (
              <p className="text-xs text-muted-foreground truncate">
                {currentItem.data.title}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {/* View mode toggles */}
          {items.length > 1 && (
            <div className="flex items-center gap-0.5 mr-1 p-0.5 bg-muted rounded-md">
              <Button
                variant={viewMode === 'single' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-6 w-6"
                onClick={() => setViewMode('single')}
                title="Single view"
              >
                <Layers className="h-3 w-3" />
              </Button>
              <Button
                variant={viewMode === 'gallery' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-6 w-6"
                onClick={() => setViewMode('gallery')}
                title="Gallery view"
              >
                <GalleryHorizontal className="h-3 w-3" />
              </Button>
              <Button
                variant={viewMode === 'split' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-6 w-6"
                onClick={() => setViewMode('split')}
                title="Split view"
              >
                <Grid3X3 className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Navigation arrows */}
          {items.length > 1 && viewMode === 'single' && (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handlePrev}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNext}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          {onExport && currentItem?.type !== 'export' && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onExport('excel')}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Gallery thumbnails bar */}
      {items.length > 1 && (viewMode === 'single' || viewMode === 'gallery') && (
        <div className="border-b bg-slate-50 dark:bg-slate-900/50">
          <ScrollArea className="w-full">
            <div className="flex gap-2 p-3">
              {items.map((item, idx) => (
                <CanvasThumbnail
                  key={item.id || idx}
                  item={item}
                  isActive={idx === selectedIndex}
                  onClick={() => handleSelectItem(item, idx)}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'split' && items.length > 1 ? (
          // Split view - show charts and tables side by side
          <div className="flex h-full divide-x">
            {/* Left: Charts */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <div className="px-2 py-1.5 border-b bg-muted/30 shrink-0">
                <div className="flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-xs font-medium">Charts ({groupedItems.chart.length})</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                {groupedItems.chart.length > 0 ? (
                  <div className="space-y-3 p-2">
                    {groupedItems.chart.map((item, idx) => (
                      <div key={idx} className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                        <CanvasContentRenderer content={item} onExport={onExport} isDownloading={isDownloading} onDownload={handleDownload} onImageFeedback={onImageFeedback} isLoadingFeedback={isLoading} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
                    No charts yet
                  </div>
                )}
              </div>
            </div>

            {/* Right: Tables */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <div className="px-2 py-1.5 border-b bg-muted/30 shrink-0">
                <div className="flex items-center gap-1.5">
                  <Table2 className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs font-medium">Tables ({groupedItems.table.length})</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                {groupedItems.table.length > 0 ? (
                  <div className="space-y-3 p-2">
                    {groupedItems.table.map((item, idx) => (
                      <div key={idx} className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                        <CanvasContentRenderer content={item} onExport={onExport} isDownloading={isDownloading} onDownload={handleDownload} onImageFeedback={onImageFeedback} isLoadingFeedback={isLoading} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
                    No tables yet
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : viewMode === 'gallery' ? (
          // Gallery view - show all items in a scrollable grid
          <ScrollArea className="h-full">
            <Tabs defaultValue="all" className="w-full">
              <div className="px-2 pt-2 border-b sticky top-0 bg-background z-10 overflow-x-auto">
                <TabsList className="inline-flex w-max gap-1 flex-nowrap">
                  <TabsTrigger value="all" className="text-xs px-2 py-1 whitespace-nowrap">
                    All ({items.length})
                  </TabsTrigger>
                  {groupedItems.chart.length > 0 && (
                    <TabsTrigger value="charts" className="text-xs px-2 py-1 whitespace-nowrap">
                      Charts ({groupedItems.chart.length})
                    </TabsTrigger>
                  )}
                  {groupedItems.table.length > 0 && (
                    <TabsTrigger value="tables" className="text-xs px-2 py-1 whitespace-nowrap">
                      Tables ({groupedItems.table.length})
                    </TabsTrigger>
                  )}
                  {groupedItems.image.length > 0 && (
                    <TabsTrigger value="images" className="text-xs px-2 py-1 whitespace-nowrap">
                      Images ({groupedItems.image.length})
                    </TabsTrigger>
                  )}
                </TabsList>
              </div>

              <TabsContent value="all" className="mt-0">
                <div className="grid gap-4 p-4">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "border rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm",
                        idx === selectedIndex && "ring-2 ring-primary"
                      )}
                      onClick={() => handleSelectItem(item, idx)}
                    >
                      <CanvasContentRenderer content={item} onExport={onExport} isDownloading={isDownloading} onDownload={handleDownload} onImageFeedback={onImageFeedback} isLoadingFeedback={isLoading} />
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="charts" className="mt-0">
                <div className="grid gap-4 p-4">
                  {groupedItems.chart.map((item, idx) => (
                    <div key={idx} className="border rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                      <CanvasContentRenderer content={item} onExport={onExport} isDownloading={isDownloading} onDownload={handleDownload} onImageFeedback={onImageFeedback} isLoadingFeedback={isLoading} />
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="tables" className="mt-0">
                <div className="grid gap-4 p-4">
                  {groupedItems.table.map((item, idx) => (
                    <div key={idx} className="border rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                      <CanvasContentRenderer content={item} onExport={onExport} isDownloading={isDownloading} onDownload={handleDownload} onImageFeedback={onImageFeedback} isLoadingFeedback={isLoading} />
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="images" className="mt-0">
                <div className="grid gap-4 p-4">
                  {groupedItems.image.map((item, idx) => (
                    <div key={idx} className="border rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                      <CanvasContentRenderer content={item} onExport={onExport} isDownloading={isDownloading} onDownload={handleDownload} onImageFeedback={onImageFeedback} isLoadingFeedback={isLoading} />
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </ScrollArea>
        ) : (
          // Single view - show selected item
          currentItem && <CanvasContentRenderer content={currentItem} onExport={onExport} isDownloading={isDownloading} onDownload={handleDownload} onImageFeedback={onImageFeedback} isLoadingFeedback={isLoading} />
        )}
      </div>

      {/* Footer with metadata */}
      {currentItem && viewMode === 'single' && (
        <div className="px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {items.length > 1 && (
                <span className="flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  {items.length} items in gallery
                </span>
              )}
              <span>
                {currentItem.type === 'chart' && currentItem.data?.data?.data?.length &&
                  `${currentItem.data.data.data.length} data points`}
                {currentItem.type === 'table' && currentItem.data?.data?.rows?.length &&
                  `${currentItem.data.data.rows.length} rows`}
              </span>
            </div>
            <Badge variant="outline" className="text-xs">
              {new Date().toLocaleTimeString()}
            </Badge>
          </div>
        </div>
      )}
    </div>
  )
}
