'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Upload,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  File,
  MoreVertical,
  Trash2,
  Download,
  Search,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  Power,
  PowerOff,
  History,
  Edit,
  Eye,
  EyeOff,
  RefreshCw,
  Tag,
  Plus,
  Type,
  X,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import type { Document } from '@/types/database'

interface DocumentVersion {
  version: number
  name: string
  file_path: string
  file_size: number | null
  change_summary: string
  created_by: string
  created_at: string
  is_current: boolean
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingDocument, setEditingDocument] = useState<Document | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    tags: '',
  })
  const [saving, setSaving] = useState(false)

  // Version dialog state
  const [versionDialogOpen, setVersionDialogOpen] = useState(false)
  const [versionDocument, setVersionDocument] = useState<Document | null>(null)
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [uploadingVersion, setUploadingVersion] = useState(false)

  // Text entry dialog state
  const [textEntryDialogOpen, setTextEntryDialogOpen] = useState(false)
  const [textEntryForm, setTextEntryForm] = useState({
    title: '',
    content: '',
    description: '',
    tags: '',
  })
  const [creatingTextEntry, setCreatingTextEntry] = useState(false)

  const loadDocuments = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false })

    setDocuments(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadDocuments()

    // Subscribe to changes
    const supabase = createClient()
    const channel = supabase
      .channel('documents-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents' },
        () => loadDocuments()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadDocuments])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)

    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)

      try {
        const response = await fetch('/api/documents/upload', {
          method: 'POST',
          body: formData,
        })

        if (response.ok) {
          toast.success(`Uploaded ${file.name}`)
        } else {
          toast.error(`Failed to upload ${file.name}`)
        }
      } catch (error) {
        console.error('Upload error:', error)
        toast.error(`Error uploading ${file.name}`)
      }
    }

    setUploading(false)
    loadDocuments()
    // Reset input
    e.target.value = ''
  }

  const handleDelete = async (documentId: string, documentName: string) => {
    if (!confirm(`Are you sure you want to delete "${documentName}"?`)) return

    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast.success('Document deleted')
        loadDocuments()
      } else {
        toast.error('Failed to delete document')
      }
    } catch (error) {
      console.error('Delete error:', error)
      toast.error('Error deleting document')
    }
  }

  const handleToggleEnabled = async (doc: Document) => {
    try {
      const response = await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !doc.is_enabled }),
      })

      if (response.ok) {
        toast.success(doc.is_enabled ? 'Removed from knowledge base' : 'Added to knowledge base')
        loadDocuments()
      } else {
        toast.error('Failed to update document')
      }
    } catch (error) {
      console.error('Toggle error:', error)
      toast.error('Error updating document')
    }
  }

  const openEditDialog = (doc: Document) => {
    setEditingDocument(doc)
    setEditForm({
      name: doc.name,
      description: doc.description || '',
      tags: (doc.tags || []).join(', '),
    })
    setEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editingDocument) return

    setSaving(true)
    try {
      const response = await fetch(`/api/documents/${editingDocument.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description || null,
          tags: editForm.tags ? editForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        }),
      })

      if (response.ok) {
        toast.success('Document updated')
        setEditDialogOpen(false)
        loadDocuments()
      } else {
        toast.error('Failed to update document')
      }
    } catch (error) {
      console.error('Save error:', error)
      toast.error('Error saving document')
    } finally {
      setSaving(false)
    }
  }

  const openVersionDialog = async (doc: Document) => {
    setVersionDocument(doc)
    setVersionDialogOpen(true)
    setLoadingVersions(true)

    try {
      const response = await fetch(`/api/documents/${doc.id}/versions`)
      if (response.ok) {
        const data = await response.json()
        setVersions(data.versions)
      }
    } catch (error) {
      console.error('Load versions error:', error)
      toast.error('Failed to load version history')
    } finally {
      setLoadingVersions(false)
    }
  }

  const handleCreateTextEntry = async () => {
    if (!textEntryForm.title.trim() || !textEntryForm.content.trim()) {
      toast.error('Title and content are required')
      return
    }

    if (textEntryForm.content.length < 10) {
      toast.error('Content must be at least 10 characters')
      return
    }

    setCreatingTextEntry(true)

    try {
      const response = await fetch('/api/documents/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: textEntryForm.title.trim(),
          content: textEntryForm.content.trim(),
          description: textEntryForm.description.trim() || undefined,
          tags: textEntryForm.tags
            ? textEntryForm.tags.split(',').map((t) => t.trim()).filter(Boolean)
            : [],
        }),
      })

      if (response.ok) {
        const data = await response.json()
        toast.success('Text entry created successfully', {
          description: `${data.chunksCreated} chunks created for search`,
        })
        setTextEntryDialogOpen(false)
        setTextEntryForm({ title: '', content: '', description: '', tags: '' })
        loadDocuments()
      } else {
        const errorData = await response.json()
        toast.error(errorData.error || 'Failed to create text entry')
      }
    } catch (error) {
      console.error('Create text entry error:', error)
      toast.error('Error creating text entry')
    } finally {
      setCreatingTextEntry(false)
    }
  }

  const handleUploadNewVersion = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !versionDocument) return

    setUploadingVersion(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('change_summary', `Updated to new file: ${file.name}`)

    try {
      const response = await fetch(`/api/documents/${versionDocument.id}/versions`, {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        toast.success('New version uploaded')
        // Refresh versions
        const versionsResponse = await fetch(`/api/documents/${versionDocument.id}/versions`)
        if (versionsResponse.ok) {
          const data = await versionsResponse.json()
          setVersions(data.versions)
        }
        loadDocuments()
      } else {
        toast.error('Failed to upload new version')
      }
    } catch (error) {
      console.error('Upload version error:', error)
      toast.error('Error uploading new version')
    } finally {
      setUploadingVersion(false)
      e.target.value = ''
    }
  }

  const getDocumentIcon = (doc: Document) => {
    const type = doc.document_type || 'other'
    const isTextEntry = doc.file_path?.startsWith('text://') ||
                        (doc.finance_metadata as any)?.isTextEntry

    if (isTextEntry) {
      return <Type className="h-8 w-8 text-purple-500" />
    }

    switch (type) {
      case 'pdf':
        return <FileText className="h-8 w-8 text-red-500" />
      case 'excel':
      case 'csv':
        return <FileSpreadsheet className="h-8 w-8 text-green-500" />
      case 'image':
        return <ImageIcon className="h-8 w-8 text-blue-500" />
      default:
        return <File className="h-8 w-8 text-gray-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Ready
          </Badge>
        )
      case 'processing':
        return (
          <Badge variant="secondary">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Processing
          </Badge>
        )
      case 'pending':
        return (
          <Badge variant="outline">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        )
      case 'failed':
        return (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const filteredDocuments = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Documents</h1>
            <p className="text-muted-foreground">
              Upload and manage your knowledge base documents
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setTextEntryDialogOpen(true)}
            >
              <Type className="mr-2 h-4 w-4" />
              Add Text
            </Button>
            <input
              type="file"
              id="file-upload"
              className="hidden"
              multiple
              accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg"
              onChange={handleUpload}
            />
            <Button
              onClick={() => document.getElementById('file-upload')?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload File
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, description, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {filteredDocuments.filter(d => d.is_enabled !== false).length} of {documents.length} enabled in knowledge base
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredDocuments.length === 0 ? (
          <Card className="max-w-md mx-auto mt-8">
            <CardHeader className="text-center">
              <div className="mx-auto p-3 bg-muted rounded-full w-fit mb-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <CardTitle>No documents yet</CardTitle>
              <CardDescription>
                Upload your financial documents to get started. Supported formats:
                PDF, Excel, CSV, and images.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload your first document
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-fr">
            {filteredDocuments.map((doc) => (
              <Card
                key={doc.id}
                className={`hover:shadow-md transition-shadow h-full ${doc.is_enabled === false ? 'opacity-60' : ''}`}
              >
                <CardContent className="p-5 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-4">
                    <div className="relative">
                      {getDocumentIcon(doc)}
                      {doc.is_enabled === false && (
                        <div className="absolute -bottom-1 -right-1 bg-white rounded-full">
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(doc)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openVersionDialog(doc)}>
                          <History className="mr-2 h-4 w-4" />
                          Version history
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleEnabled(doc)}>
                          {doc.is_enabled === false ? (
                            <>
                              <Eye className="mr-2 h-4 w-4" />
                              Enable in knowledge base
                            </>
                          ) : (
                            <>
                              <EyeOff className="mr-2 h-4 w-4" />
                              Disable in knowledge base
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {!doc.file_path?.startsWith('text://') && (
                          <DropdownMenuItem>
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(doc.id, doc.name)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <h3 className="font-semibold truncate mb-2 text-[15px]" title={doc.name}>
                    {doc.name}
                  </h3>

                  <div className="flex-1 min-h-0 space-y-3 mb-4">
                    {doc.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {doc.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {getStatusBadge(doc.status || 'pending')}
                      {doc.file_path?.startsWith('text://') && (
                        <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-800">
                          Text
                        </Badge>
                      )}
                      {doc.version && doc.version > 1 && (
                        <Badge variant="outline" className="text-xs">
                          v{doc.version}
                        </Badge>
                      )}
                      <span className="text-sm text-muted-foreground">
                        {doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : ''}
                      </span>
                    </div>

                    {doc.tags && doc.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {doc.tags.slice(0, 3).map((tag, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs px-2 py-0.5">
                            {tag}
                          </Badge>
                        ))}
                        {doc.tags.length > 3 && (
                          <Badge variant="secondary" className="text-xs px-2 py-0.5">
                            +{doc.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t mt-auto">
                    <span className="text-sm text-muted-foreground">
                      {doc.created_at ? formatDistanceToNow(new Date(doc.created_at), { addSuffix: true }) : 'Unknown'}
                    </span>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => handleToggleEnabled(doc)}
                            className="flex items-center gap-2 group"
                          >
                            <span className={`text-sm font-medium ${doc.is_enabled !== false ? 'text-green-600' : 'text-muted-foreground'}`}>
                              {doc.is_enabled !== false ? 'Active' : 'Inactive'}
                            </span>
                            <div className={`relative w-9 h-5 rounded-full transition-colors ${
                              doc.is_enabled !== false ? 'bg-green-500' : 'bg-gray-300'
                            }`}>
                              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                                doc.is_enabled !== false ? 'left-[18px]' : 'left-0.5'
                              }`} />
                            </div>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>{doc.is_enabled !== false ? 'Exclude from knowledge base' : 'Include in knowledge base'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  {doc.status === 'failed' && doc.processing_error && (
                    <p className="text-xs text-destructive mt-2 truncate" title={doc.processing_error}>
                      {doc.processing_error}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
            <DialogDescription>
              Update document details and metadata
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Add a description for this document..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={editForm.tags}
                onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                placeholder="financial, q4, report"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={versionDialogOpen} onOpenChange={setVersionDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
            <DialogDescription>
              {versionDocument?.name} - View and manage document versions
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-muted-foreground">
                {versions.length} version{versions.length !== 1 ? 's' : ''}
              </p>
              <div>
                <input
                  type="file"
                  id="version-upload"
                  className="hidden"
                  accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg"
                  onChange={handleUploadNewVersion}
                />
                <Button
                  size="sm"
                  onClick={() => document.getElementById('version-upload')?.click()}
                  disabled={uploadingVersion}
                >
                  {uploadingVersion ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Upload New Version
                    </>
                  )}
                </Button>
              </div>
            </div>

            {loadingVersions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-auto">
                {versions.map((version, idx) => (
                  <div
                    key={idx}
                    className={`p-3 border rounded-lg ${version.is_current ? 'bg-primary/5 border-primary' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={version.is_current ? 'default' : 'outline'}>
                          v{version.version}
                        </Badge>
                        {version.is_current && (
                          <Badge variant="secondary">Current</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {version.created_at ? formatDistanceToNow(new Date(version.created_at), { addSuffix: true }) : ''}
                      </span>
                    </div>
                    <p className="text-sm mt-2">{version.change_summary}</p>
                    {version.file_size && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Size: {(version.file_size / 1024).toFixed(1)} KB
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVersionDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Text Entry Dialog */}
      <Dialog open={textEntryDialogOpen} onOpenChange={setTextEntryDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Type className="h-5 w-5" />
              Add Text to Knowledge Base
            </DialogTitle>
            <DialogDescription>
              Add text content directly to your knowledge base. This is useful for notes,
              policies, procedures, or any text-based information you want to reference later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="text-title">Title *</Label>
              <Input
                id="text-title"
                value={textEntryForm.title}
                onChange={(e) =>
                  setTextEntryForm({ ...textEntryForm, title: e.target.value })
                }
                placeholder="e.g., Q4 Budget Guidelines"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="text-content">Content *</Label>
              <Textarea
                id="text-content"
                value={textEntryForm.content}
                onChange={(e) =>
                  setTextEntryForm({ ...textEntryForm, content: e.target.value })
                }
                placeholder="Enter your text content here. This will be indexed and searchable in your knowledge base..."
                className="min-h-[200px] resize-y"
              />
              <p className="text-xs text-muted-foreground">
                {textEntryForm.content.length} characters
                {textEntryForm.content.length > 0 && textEntryForm.content.length < 10 && (
                  <span className="text-destructive ml-2">
                    (minimum 10 characters required)
                  </span>
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="text-description">Description (optional)</Label>
              <Input
                id="text-description"
                value={textEntryForm.description}
                onChange={(e) =>
                  setTextEntryForm({ ...textEntryForm, description: e.target.value })
                }
                placeholder="Brief description of this content"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="text-tags">Tags (comma-separated, optional)</Label>
              <Input
                id="text-tags"
                value={textEntryForm.tags}
                onChange={(e) =>
                  setTextEntryForm({ ...textEntryForm, tags: e.target.value })
                }
                placeholder="budget, guidelines, q4"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTextEntryDialogOpen(false)
                setTextEntryForm({ title: '', content: '', description: '', tags: '' })
              }}
              disabled={creatingTextEntry}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTextEntry}
              disabled={
                creatingTextEntry ||
                !textEntryForm.title.trim() ||
                textEntryForm.content.length < 10
              }
            >
              {creatingTextEntry ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add to Knowledge Base
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
