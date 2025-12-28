import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { processDocument } from '@/lib/gemini/document-processor'
import { generateEmbeddings } from '@/lib/embeddings/openai'
import type { DocumentType } from '@/types/database'

export const runtime = 'nodejs'
export const maxDuration = 60

function getDocumentType(mimeType: string): DocumentType {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'excel'
  if (mimeType === 'text/csv') return 'csv'
  if (mimeType.startsWith('image/')) return 'image'
  return 'other'
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const serviceSupabase = await createServiceClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    const visibility = formData.get('visibility') as string || 'private'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Upload to Supabase Storage
    const filePath = `${user.id}/${Date.now()}_${file.name}`
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await serviceSupabase.storage
      .from('documents')
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    // Create document record
    const documentType = getDocumentType(file.type)
    const { data: document, error: docError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
        document_type: documentType,
        status: 'processing',
        visibility,
      })
      .select()
      .single()

    if (docError || !document) {
      console.error('Document creation error:', docError)
      return NextResponse.json({ error: 'Failed to create document record' }, { status: 500 })
    }

    // Process document asynchronously
    processDocumentAsync(document.id, fileBuffer, file.type, file.name, serviceSupabase)

    return NextResponse.json({
      document,
      message: 'Document uploaded and processing started',
    })
  } catch (error) {
    console.error('Upload API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function processDocumentAsync(
  documentId: string,
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string,
  supabase: Awaited<ReturnType<typeof createServiceClient>>
) {
  try {
    // Process with Gemini
    const result = await processDocument(fileBuffer, mimeType, fileName)

    // Generate embeddings for chunks
    const chunkContents = result.chunks.map((c) => c.content)
    const embeddings = await generateEmbeddings(chunkContents)

    // Insert chunks with embeddings
    const chunksToInsert = result.chunks.map((chunk, index) => ({
      document_id: documentId,
      chunk_index: index,
      content: chunk.content,
      embedding: JSON.stringify(embeddings[index]), // Convert to string for pgvector
      metadata: chunk.metadata as any,
    }))

    await supabase.from('document_chunks').insert(chunksToInsert as any)

    // Update document status
    await supabase
      .from('documents')
      .update({
        status: 'completed' as const,
        finance_metadata: result.metadata as any,
      })
      .eq('id', documentId)

    console.log(`Document ${documentId} processed successfully`)
  } catch (error) {
    console.error(`Error processing document ${documentId}:`, error)

    // Update document with error status
    await supabase
      .from('documents')
      .update({
        status: 'failed',
        processing_error: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', documentId)
  }
}
