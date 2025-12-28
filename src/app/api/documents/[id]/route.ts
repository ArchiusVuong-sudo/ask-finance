import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - Get a single document
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: document, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    return NextResponse.json({ document })
  } catch (error) {
    console.error('Get document error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Update a document
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      description,
      is_enabled,
      visibility,
      tags,
    } = body

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (is_enabled !== undefined) updates.is_enabled = is_enabled
    if (visibility !== undefined) updates.visibility = visibility
    if (tags !== undefined) updates.tags = tags

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data: document, error } = await supabase
      .from('documents')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id) // Ensure user owns the document
      .select()
      .single()

    if (error) {
      console.error('Update error:', error)
      return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
    }

    if (!document) {
      return NextResponse.json({ error: 'Document not found or access denied' }, { status: 404 })
    }

    // Log the update action
    await supabase.from('usage_logs').insert({
      user_id: user.id,
      action: 'update_document',
      resource_type: 'document',
      resource_id: id,
      details: { updates },
    })

    return NextResponse.json({ document })
  } catch (error) {
    console.error('Update document error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete a document
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const serviceSupabase = await createServiceClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the document first to get file path
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !document) {
      return NextResponse.json({ error: 'Document not found or access denied' }, { status: 404 })
    }

    // Delete from storage
    if (document.file_path) {
      await serviceSupabase.storage
        .from('documents')
        .remove([document.file_path])
    }

    // Delete the document record (cascades to chunks)
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }

    // Log the delete action
    await supabase.from('usage_logs').insert({
      user_id: user.id,
      action: 'delete_document',
      resource_type: 'document',
      resource_id: id,
      details: { name: document.name },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete document error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
