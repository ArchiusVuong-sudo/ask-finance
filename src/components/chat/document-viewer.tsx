'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Citation {
  documentId: string
  documentName: string
  pageNumber?: number
  excerpt: string
  storagePath?: string
}

interface DocumentViewerProps {
  citation: Citation | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface DocumentDetails {
  id: string
  name: string
  mime_type: string | null
  file_path: string
  file_size: number | null
  created_at: string | null
  finance_metadata?: any
}

export function DocumentViewer({ citation, open, onOpenChange }: DocumentViewerProps) {
  const [document, setDocument] = useState<DocumentDetails | null>(null)
  const [documentUrl, setDocumentUrl] = useState<string | null>(null)
  const [chunks, setChunks] = useState<{ content: string; chunk_index: number; metadata?: any }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    if (citation && open) {
      loadDocument()
    }
  }, [citation, open])

  const loadDocument = async () => {
    if (!citation) return

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Get document details
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', citation.documentId)
        .single()

      if (docError) throw docError
      setDocument(doc as unknown as DocumentDetails)

      // Get signed URL for the document
      if (doc.file_path) {
        const { data: urlData, error: urlError } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.file_path, 3600) // 1 hour expiry

        if (!urlError && urlData) {
          setDocumentUrl(urlData.signedUrl)
        }
      }

      // Get document chunks for context
      const { data: chunkData } = await supabase
        .from('document_chunks')
        .select('content, chunk_index, metadata')
        .eq('document_id', citation.documentId)
        .order('chunk_index', { ascending: true })

      setChunks(chunkData || [])

      // Set initial page if provided
      if (citation.pageNumber) {
        setCurrentPage(citation.pageNumber)
      }

    } catch (err) {
      console.error('Error loading document:', err)
      setError('Failed to load document. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const getFileIcon = (fileType: string) => {
    if (fileType?.includes('pdf')) return FileText
    if (fileType?.includes('excel') || fileType?.includes('spreadsheet') || fileType?.includes('csv')) return FileSpreadsheet
    if (fileType?.includes('image')) return ImageIcon
    return FileText
  }

  const downloadDocument = () => {
    if (documentUrl) {
      window.open(documentUrl, '_blank')
    }
  }

  const FileIcon = document ? getFileIcon(document.mime_type || '') : FileText

  // Find the chunk that matches the citation
  const highlightedChunkIndex = chunks.findIndex(c =>
    citation?.excerpt && c.content.includes(citation.excerpt.substring(0, 50))
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg">
                  {loading ? 'Loading...' : document?.name || 'Document'}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-2 mt-1">
                  {document?.finance_metadata?.documentType && (
                    <Badge variant="secondary" className="text-xs">
                      {document.finance_metadata.documentType}
                    </Badge>
                  )}
                  {document?.finance_metadata?.period && (
                    <Badge variant="outline" className="text-xs">
                      {document.finance_metadata.period}
                    </Badge>
                  )}
                  {document?.finance_metadata?.businessUnit && (
                    <Badge variant="outline" className="text-xs">
                      {document.finance_metadata.businessUnit}
                    </Badge>
                  )}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {documentUrl && (
                <>
                  <Button variant="outline" size="sm" onClick={downloadDocument}>
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(documentUrl, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Open
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex">
          {/* Document Preview */}
          <div className="flex-1 border-r">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <p className="text-destructive">{error}</p>
                <Button variant="outline" className="mt-4" onClick={loadDocument}>
                  Try Again
                </Button>
              </div>
            ) : document?.mime_type?.includes('pdf') && documentUrl ? (
              <iframe
                src={`${documentUrl}#page=${currentPage}`}
                className="w-full h-full"
                title={document.name}
              />
            ) : document?.mime_type?.includes('image') && documentUrl ? (
              <div className="flex items-center justify-center h-full p-4">
                <img
                  src={documentUrl}
                  alt={document.name}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <FileIcon className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-2">
                  Preview not available for this file type
                </p>
                {documentUrl && (
                  <Button onClick={downloadDocument}>
                    <Download className="h-4 w-4 mr-2" />
                    Download to View
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Extracted Content Panel */}
          <div className="w-80 flex flex-col">
            <div className="px-4 py-3 border-b bg-muted/50">
              <h3 className="font-medium text-sm">Extracted Content</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {chunks.length} sections indexed
              </p>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {/* Highlighted excerpt */}
                {citation?.excerpt && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-xs font-medium text-yellow-800 mb-2">
                      Referenced Content
                    </p>
                    <p className="text-sm text-yellow-900">{citation.excerpt}</p>
                    {citation.pageNumber && (
                      <p className="text-xs text-yellow-700 mt-2">
                        Page {citation.pageNumber}
                      </p>
                    )}
                  </div>
                )}

                {/* Document chunks */}
                {chunks.map((chunk, index) => (
                  <div
                    key={chunk.chunk_index}
                    className={cn(
                      'p-3 rounded-lg border transition-colors',
                      index === highlightedChunkIndex
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="text-xs">
                        Section {chunk.chunk_index + 1}
                      </Badge>
                      {chunk.metadata?.page_number && (
                        <span className="text-xs text-muted-foreground">
                          Page {chunk.metadata.page_number}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-4">
                      {chunk.content}
                    </p>
                  </div>
                ))}

                {chunks.length === 0 && !loading && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No extracted content available
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Footer with pagination (for PDFs) */}
        {document?.mime_type?.includes('pdf') && (
          <div className="px-6 py-3 border-t flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {currentPage}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
