import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// GET - List all threads for the current user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get pagination params
    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')

    // Get threads with message count
    const { data: threads, error, count } = await supabase
      .from('threads')
      .select(`
        id,
        title,
        created_at,
        updated_at
      `, { count: 'exact' })
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('List threads error:', error)
      return NextResponse.json({ error: 'Failed to fetch threads' }, { status: 500 })
    }

    return NextResponse.json({
      threads: threads || [],
      total: count || 0,
      limit,
      offset,
    })
  } catch (error) {
    console.error('List threads error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create a new thread
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title } = body

    const { data: thread, error } = await supabase
      .from('threads')
      .insert({
        user_id: user.id,
        title: title || 'New Conversation',
      })
      .select()
      .single()

    if (error) {
      console.error('Create thread error:', error)
      return NextResponse.json({ error: 'Failed to create thread' }, { status: 500 })
    }

    return NextResponse.json({ thread }, { status: 201 })
  } catch (error) {
    console.error('Create thread error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
