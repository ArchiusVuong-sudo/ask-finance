import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateEmbeddings } from '@/lib/embeddings/openai'

export const runtime = 'nodejs'
export const maxDuration = 60

interface TextEntryRequest {
  title: string
  content: string
  description?: string
  tags?: string[]
  visibility?: 'private' | 'public' | 'organization'
}

function createTextChunks(
  content: string,
  metadata: Record<string, unknown>,
  chunkSize = 1000,
  overlap = 200
): { content: string; metadata: Record<string, unknown> }[] {
  const chunks: { content: string; metadata: Record<string, unknown> }[] = []

  // Split by paragraphs first
  const paragraphs = content.split(/\n\n+/)
  let currentChunk = ''
  let chunkIndex = 0

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        metadata: {
          ...metadata,
          chunkIndex,
        },
      })
      chunkIndex++

      // Keep overlap
      const words = currentChunk.split(' ')
      const overlapWords = words.slice(-Math.floor(overlap / 5))
      currentChunk = overlapWords.join(' ') + '\n\n' + paragraph
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph
    }
  }

  // Add remaining content
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      metadata: {
        ...metadata,
        chunkIndex,
      },
    })
  }

  // If no chunks created (very short content), create one chunk
  if (chunks.length === 0 && content.trim()) {
    chunks.push({
      content: content.trim(),
      metadata: {
        ...metadata,
        chunkIndex: 0,
      },
    })
  }

  return chunks
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get request body
    const body: TextEntryRequest = await request.json()
    const { title, content, description, tags, visibility = 'private' } = body

    if (!title || !content) {
      return NextResponse.json(
        { error: 'Title and content are required' },
        { status: 400 }
      )
    }

    if (content.length < 10) {
      return NextResponse.json(
        { error: 'Content must be at least 10 characters' },
        { status: 400 }
      )
    }

    // Create document record for text entry
    const { data: document, error: docError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        name: title,
        file_path: `text://${user.id}/${Date.now()}`, // Virtual path for text entries
        file_size: new Blob([content]).size,
        mime_type: 'text/plain',
        document_type: 'other',
        status: 'processing',
        visibility,
        description,
        tags: tags || [],
        finance_metadata: {
          documentType: 'text_entry',
          title,
          contentLength: content.length,
          isTextEntry: true,
        },
      })
      .select()
      .single()

    if (docError || !document) {
      console.error('Document creation error:', docError)
      return NextResponse.json(
        { error: 'Failed to create document record' },
        { status: 500 }
      )
    }

    // Process text entry - create chunks and embeddings
    try {
      const chunks = createTextChunks(content, {
        documentType: 'text_entry',
        title,
      })

      // Generate embeddings for chunks
      const chunkContents = chunks.map((c) => c.content)
      const embeddings = await generateEmbeddings(chunkContents)

      // Insert chunks with embeddings
      const chunksToInsert = chunks.map((chunk, index) => ({
        document_id: document.id,
        chunk_index: index,
        content: chunk.content,
        embedding: JSON.stringify(embeddings[index]),
        metadata: chunk.metadata as any,
      }))

      await supabase.from('document_chunks').insert(chunksToInsert as any)

      // Update document status to completed
      await supabase
        .from('documents')
        .update({
          status: 'completed' as const,
        })
        .eq('id', document.id)

      // Log the action
      await supabase.from('usage_logs').insert({
        user_id: user.id,
        action: 'create_text_entry',
        resource_type: 'document',
        resource_id: document.id,
        details: {
          title,
          contentLength: content.length,
          chunksCreated: chunks.length,
        },
      })

      return NextResponse.json({
        document: { ...document, status: 'completed' },
        message: 'Text entry created and processed successfully',
        chunksCreated: chunks.length,
      })
    } catch (processingError) {
      console.error('Text processing error:', processingError)

      // Update document with error status
      await supabase
        .from('documents')
        .update({
          status: 'failed',
          processing_error:
            processingError instanceof Error
              ? processingError.message
              : 'Unknown error',
        })
        .eq('id', document.id)

      return NextResponse.json(
        { error: 'Failed to process text entry' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Text entry API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
