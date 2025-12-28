import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { processDocument } from '@/lib/gemini/document-processor'
import { generateEmbeddings } from '@/lib/embeddings/openai'

export const runtime = 'nodejs'
export const maxDuration = 60

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - Get version history for a document
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Check access
    if (document.user_id !== user.id && document.visibility === 'private') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get version history
    const { data: versions, error: versionsError } = await (supabase
      .from('document_versions' as any)
      .select('*')
      .eq('document_id', id)
      .order('version', { ascending: false }))

    if (versionsError) {
      console.error('Versions fetch error:', versionsError)
    }

    // Combine current version with history
    const allVersions = [
      {
        version: document.version || 1,
        name: document.name,
        file_path: document.file_path,
        file_size: document.file_size,
        change_summary: 'Current version',
        created_by: document.user_id,
        created_at: document.updated_at || document.created_at,
        is_current: true,
      },
      ...(versions || []).map((v: any) => ({
        ...v,
        is_current: false,
      })),
    ]

    return NextResponse.json({ versions: allVersions })
  } catch (error) {
    console.error('Get versions error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Upload a new version of a document
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const serviceSupabase = await createServiceClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current document
    const { data: currentDoc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (docError || !currentDoc) {
      return NextResponse.json({ error: 'Document not found or access denied' }, { status: 404 })
    }

    // Get form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    const changeSummary = formData.get('change_summary') as string || 'Updated document'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Upload new file
    const newFilePath = `${user.id}/${Date.now()}_v${(currentDoc.version || 1) + 1}_${file.name}`
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await serviceSupabase.storage
      .from('documents')
      .upload(newFilePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    // Archive current version to document_versions
    const { error: archiveError } = await supabase
      .from('document_versions' as any)
      .insert({
        document_id: id,
        version: currentDoc.version || 1,
        name: currentDoc.name,
        file_path: currentDoc.file_path,
        file_size: currentDoc.file_size,
        change_summary: changeSummary,
        created_by: user.id,
      })

    if (archiveError) {
      console.error('Archive error:', archiveError)
    }

    // Update document with new version
    const newVersion = (currentDoc.version || 1) + 1
    const { data: updatedDoc, error: updateError } = await supabase
      .from('documents')
      .update({
        file_path: newFilePath,
        file_size: file.size,
        version: newVersion,
        status: 'processing',
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
    }

    // Delete old chunks and reprocess
    await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', id)

    // Process the new version asynchronously
    processNewVersion(id, fileBuffer, file.type, file.name, serviceSupabase)

    // Log the version update
    await supabase.from('usage_logs').insert({
      user_id: user.id,
      action: 'create_document_version',
      resource_type: 'document',
      resource_id: id,
      details: {
        old_version: currentDoc.version || 1,
        new_version: newVersion,
        change_summary: changeSummary,
      },
    })

    return NextResponse.json({
      document: updatedDoc,
      message: `Document updated to version ${newVersion}`,
    })
  } catch (error) {
    console.error('Create version error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function processNewVersion(
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
      embedding: JSON.stringify(embeddings[index]),
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

    console.log(`Document ${documentId} new version processed successfully`)
  } catch (error) {
    console.error(`Error processing new version for document ${documentId}:`, error)

    await supabase
      .from('documents')
      .update({
        status: 'failed',
        processing_error: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', documentId)
  }
}
