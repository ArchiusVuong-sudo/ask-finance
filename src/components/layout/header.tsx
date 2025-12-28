'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Menu, PanelRightOpen, PanelRightClose } from 'lucide-react'
import type { Thread } from '@/types/database'

interface HeaderProps {
  thread?: Thread | null
  onToggleSidebar?: () => void
  onToggleCanvas?: () => void
  canvasOpen?: boolean
  sidebarCollapsed?: boolean
}

export function Header({
  thread,
  onToggleSidebar,
  onToggleCanvas,
  canvasOpen = false,
  sidebarCollapsed = false,
}: HeaderProps) {
  return (
    <header className="flex items-center justify-between h-14 px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-3">
        {sidebarCollapsed && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleSidebar}
                  className="h-8 w-8"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle sidebar</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <div className="flex items-center gap-2">
          <h1 className="font-medium truncate max-w-[300px]">
            {thread?.title || 'New Conversation'}
          </h1>
          {thread?.metadata && typeof thread.metadata === 'object' && (
            <Badge variant="secondary" className="text-xs">
              {(thread.metadata as Record<string, unknown>).model as string || 'claude-sonnet'}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleCanvas}
                className="h-8 w-8"
              >
                {canvasOpen ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {canvasOpen ? 'Close canvas' : 'Open canvas'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </header>
  )
}
