'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Sidebar } from '@/components/layout/sidebar'
import type { Profile, Thread } from '@/types/database'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<Profile | null>(null)
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  const loadData = useCallback(async () => {
    const supabase = createClient()

    // Get current user
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      router.push('/login')
      return
    }

    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single()

    setUser(profile)

    // Get threads
    const { data: threadsData } = await supabase
      .from('threads')
      .select('*')
      .eq('user_id', authUser.id)
      .eq('is_archived', false)
      .order('updated_at', { ascending: false })

    setThreads(threadsData || [])
    setLoading(false)
  }, [router])

  useEffect(() => {
    loadData()

    // Subscribe to realtime updates
    const supabase = createClient()
    const channel = supabase
      .channel('threads-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'threads',
        },
        () => {
          loadData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadData])

  const handleNewChat = async () => {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (!authUser) return

    const { data: newThread, error } = await supabase
      .from('threads')
      .insert({
        user_id: authUser.id,
        title: 'New Conversation',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating thread:', error)
      return
    }

    if (newThread) {
      router.push(`/chat/${newThread.id}`)
    }
  }

  const handleDeleteThread = async (threadId: string) => {
    const supabase = createClient()

    await supabase
      .from('threads')
      .update({ is_archived: true })
      .eq('id', threadId)

    // If we're on the deleted thread, go to /chat
    if (pathname === `/chat/${threadId}`) {
      router.push('/chat')
    }

    loadData()
  }

  const handleRenameThread = async (threadId: string, newTitle: string) => {
    const supabase = createClient()

    await supabase
      .from('threads')
      .update({ title: newTitle })
      .eq('id', threadId)

    loadData()
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        user={user}
        threads={threads}
        onNewChat={handleNewChat}
        onDeleteThread={handleDeleteThread}
        onRenameThread={handleRenameThread}
      />
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  )
}
