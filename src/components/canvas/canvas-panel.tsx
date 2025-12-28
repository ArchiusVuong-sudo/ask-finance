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
        'flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 min-w-[100px]',
        'hover:shadow-lg hover:scale-105',
        isActive
          ? `border-transparent bg-gradient-to-br ${config.gradient} text-white shadow-lg`
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
      )}
    >
      <div className={cn(
        'p-2 rounded-lg',
        isActive ? 'bg-white/20' : config.bgColor
      )}>
        <Icon className={cn('h-5 w-5', isActive ? 'text-white' : config.color)} />
      </div>
      <span className={cn(
        'text-xs font-medium truncate max-w-[80px]',
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
}: {
  content: CanvasContent
  onExport?: (format: 'excel' | 'powerpoint' | 'image') => void
  isDownloading?: boolean
  onDownload?: (content: CanvasContent) => Promise<void>
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
      return (
        <div className="flex items-center justify-center h-full p-4">
          {imageData?.imageUrl ? (
            <img
              src={imageData.imageUrl}
              alt={imageData.title || 'Generated image'}
              className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
            />
          ) : imageData?.imageData ? (
            <img
              src={`data:${imageData.mimeType || 'image/png'};base64,${imageData.imageData}`}
              alt={imageData.title || 'Generated image'}
              className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
            />
          ) : (
            <div className="text-center space-y-4">
              <ImageIcon className="h-16 w-16 mx-auto text-purple-500" />
              <p className="text-muted-foreground">Image preview not available</p>
            </div>
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

export function CanvasPanel({ content, allItems = [], onClose, onExport, onSelectItem }: CanvasPanelProps) {
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
            ? 'w-[55vw] min-w-[800px] max-w-[1200px]'
            : 'w-[550px] min-w-[500px]'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', config.bgColor)}>
            <Icon className={cn('h-4 w-4', config.color)} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm">{config.title}</h3>
              {items.length > 1 && (
                <Badge variant="secondary" className="text-xs">
                  {selectedIndex + 1} / {items.length}
                </Badge>
              )}
            </div>
            {currentItem?.data?.title && (
              <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                {currentItem.data.title}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* View mode toggles */}
          {items.length > 1 && (
            <div className="flex items-center gap-0.5 mr-2 p-0.5 bg-muted rounded-lg">
              <Button
                variant={viewMode === 'single' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode('single')}
                title="Single view"
              >
                <Layers className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === 'gallery' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode('gallery')}
                title="Gallery view"
              >
                <GalleryHorizontal className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === 'split' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setViewMode('split')}
                title="Split view"
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Navigation arrows */}
          {items.length > 1 && viewMode === 'single' && (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {onExport && currentItem?.type !== 'export' && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onExport('excel')}>
              <Download className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
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
              <div className="p-2 border-b bg-muted/30 shrink-0">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium">Charts ({groupedItems.chart.length})</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                {groupedItems.chart.length > 0 ? (
                  <div className="space-y-4 p-3">
                    {groupedItems.chart.map((item, idx) => (
                      <div key={idx} className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                        <CanvasContentRenderer content={item} onExport={onExport} isDownloading={isDownloading} onDownload={handleDownload} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                    No charts generated yet
                  </div>
                )}
              </div>
            </div>

            {/* Right: Tables */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <div className="p-2 border-b bg-muted/30 shrink-0">
                <div className="flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Tables ({groupedItems.table.length})</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                {groupedItems.table.length > 0 ? (
                  <div className="space-y-4 p-3">
                    {groupedItems.table.map((item, idx) => (
                      <div key={idx} className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                        <CanvasContentRenderer content={item} onExport={onExport} isDownloading={isDownloading} onDownload={handleDownload} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                    No tables generated yet
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : viewMode === 'gallery' ? (
          // Gallery view - show all items in a scrollable grid
          <ScrollArea className="h-full">
            <Tabs defaultValue="all" className="w-full">
              <div className="px-4 pt-2 border-b sticky top-0 bg-background z-10">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="all" className="text-xs">
                    All ({items.length})
                  </TabsTrigger>
                  {groupedItems.chart.length > 0 && (
                    <TabsTrigger value="charts" className="text-xs">
                      Charts ({groupedItems.chart.length})
                    </TabsTrigger>
                  )}
                  {groupedItems.table.length > 0 && (
                    <TabsTrigger value="tables" className="text-xs">
                      Tables ({groupedItems.table.length})
                    </TabsTrigger>
                  )}
                  {groupedItems.image.length > 0 && (
                    <TabsTrigger value="images" className="text-xs">
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
                      <CanvasContentRenderer content={item} onExport={onExport} isDownloading={isDownloading} onDownload={handleDownload} />
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="charts" className="mt-0">
                <div className="grid gap-4 p-4">
                  {groupedItems.chart.map((item, idx) => (
                    <div key={idx} className="border rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                      <CanvasContentRenderer content={item} onExport={onExport} isDownloading={isDownloading} onDownload={handleDownload} />
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="tables" className="mt-0">
                <div className="grid gap-4 p-4">
                  {groupedItems.table.map((item, idx) => (
                    <div key={idx} className="border rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                      <CanvasContentRenderer content={item} onExport={onExport} isDownloading={isDownloading} onDownload={handleDownload} />
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="images" className="mt-0">
                <div className="grid gap-4 p-4">
                  {groupedItems.image.map((item, idx) => (
                    <div key={idx} className="border rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                      <CanvasContentRenderer content={item} onExport={onExport} isDownloading={isDownloading} onDownload={handleDownload} />
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </ScrollArea>
        ) : (
          // Single view - show selected item
          currentItem && <CanvasContentRenderer content={currentItem} onExport={onExport} isDownloading={isDownloading} onDownload={handleDownload} />
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
