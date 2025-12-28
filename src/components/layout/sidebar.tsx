'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  TrendingUp,
  MessageSquarePlus,
  FileText,
  Settings,
  LogOut,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Profile, Thread } from '@/types/database'

interface SidebarProps {
  user: Profile | null
  threads: Thread[]
  onNewChat: () => void
  onDeleteThread: (threadId: string) => void
  onRenameThread: (threadId: string, newTitle: string) => void
}

export function Sidebar({
  user,
  threads,
  onNewChat,
  onDeleteThread,
  onRenameThread,
}: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const startEditing = (thread: Thread) => {
    setEditingId(thread.id)
    setEditTitle(thread.title || '')
  }

  const saveEdit = (threadId: string) => {
    if (editTitle.trim()) {
      onRenameThread(threadId, editTitle.trim())
    }
    setEditingId(null)
  }

  const getInitials = (name: string | null) => {
    if (!name) return 'U'
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-slate-900 text-white transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        {!collapsed && (
          <Link href="/chat" className="flex items-center gap-2">
            <div className="p-1.5 bg-primary rounded-lg">
              <TrendingUp className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-semibold">Ask Finance</span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="text-slate-400 hover:text-white hover:bg-slate-800"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* New Chat Button */}
      <div className="px-3 mb-2">
        <Button
          onClick={onNewChat}
          className={cn(
            'w-full justify-start gap-2 bg-slate-800 hover:bg-slate-700',
            collapsed && 'justify-center px-2'
          )}
        >
          <MessageSquarePlus className="h-4 w-4" />
          {!collapsed && 'New Chat'}
        </Button>
      </div>

      <Separator className="bg-slate-800" />

      {/* Thread List */}
      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-1" style={{ width: collapsed ? 'auto' : 'calc(256px - 24px)' }}>
          {threads.map((thread) => {
            const isActive = pathname === `/chat/${thread.id}`
            const isEditing = editingId === thread.id

            return (
              <div key={thread.id} className="relative overflow-hidden">
                {isEditing ? (
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => saveEdit(thread.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(thread.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="w-full px-3 py-2 text-sm bg-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    autoFocus
                  />
                ) : (
                  <div
                    className={cn(
                      'group flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                      isActive
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800',
                      collapsed && 'justify-center px-2'
                    )}
                  >
                    <Link
                      href={`/chat/${thread.id}`}
                      className="flex items-center gap-2 flex-1 overflow-hidden"
                    >
                      <MessageSquarePlus className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && (
                        <span className="overflow-hidden text-ellipsis whitespace-nowrap" title={thread.title || ''}>
                          {thread.title}
                        </span>
                      )}
                    </Link>
                    {!collapsed && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="h-6 w-6 flex-shrink-0 flex items-center justify-center rounded text-slate-500 hover:text-white hover:bg-slate-600 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              startEditing(thread)
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeleteThread(thread.id)
                            }}
                            className="text-red-500 focus:text-red-500"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>

      <Separator className="bg-slate-800" />

      {/* Navigation Links */}
      <div className="p-3 space-y-1">
        <Link
          href="/documents"
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
            pathname === '/documents'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800',
            collapsed && 'justify-center px-2'
          )}
        >
          <FileText className="h-4 w-4" />
          {!collapsed && 'Documents'}
        </Link>
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
            pathname === '/settings'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800',
            collapsed && 'justify-center px-2'
          )}
        >
          <Settings className="h-4 w-4" />
          {!collapsed && 'Settings'}
        </Link>
      </div>

      <Separator className="bg-slate-800" />

      {/* User Menu */}
      <div className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                'w-full justify-start gap-2 text-slate-400 hover:text-white hover:bg-slate-800',
                collapsed && 'justify-center px-2'
              )}
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={user?.avatar_url ?? undefined} />
                <AvatarFallback className="bg-slate-700 text-xs">
                  {getInitials(user?.full_name ?? null)}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <span className="truncate text-sm">
                  {user?.full_name || user?.email}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{user?.full_name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
