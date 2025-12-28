import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - Get a single thread with its messages
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get thread with messages
    const { data: thread, error } = await supabase
      .from('threads')
      .select(`
        *,
        messages (
          id,
          role,
          content,
          citations,
          canvas_content,
          tool_calls,
          created_at
        )
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    return NextResponse.json({ thread })
  } catch (error) {
    console.error('Get thread error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Update a thread (e.g., rename)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title } = body

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const { data: thread, error } = await supabase
      .from('threads')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Update error:', error)
      return NextResponse.json({ error: 'Failed to update thread' }, { status: 500 })
    }

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    return NextResponse.json({ thread })
  } catch (error) {
    console.error('Update thread error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete a thread and all its messages
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify thread exists and belongs to user
    const { data: thread, error: fetchError } = await supabase
      .from('threads')
      .select('id, title')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // Delete all messages first (though CASCADE should handle this)
    await supabase
      .from('messages')
      .delete()
      .eq('thread_id', id)

    // Delete the thread
    const { error: deleteError } = await supabase
      .from('threads')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete thread' }, { status: 500 })
    }

    // Log the action
    await supabase.from('usage_logs').insert({
      user_id: user.id,
      action: 'delete_thread',
      resource_type: 'thread',
      resource_id: id,
      details: { title: thread.title },
    })

    return NextResponse.json({ success: true, message: 'Thread deleted successfully' })
  } catch (error) {
    console.error('Delete thread error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
