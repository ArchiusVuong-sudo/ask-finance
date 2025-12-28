'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  RefreshCw,
  Palette,
  ZoomIn,
  Minimize2,
  LayoutGrid,
  Send,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type ImageFeedbackAction =
  | 'regenerate'
  | 'change_style'
  | 'more_detail'
  | 'simplify'
  | 'different_layout'

export interface ImageFeedbackData {
  type: 'quick_action' | 'custom_text'
  imageId: string
  action?: ImageFeedbackAction
  customText?: string
  originalPrompt?: string
  originalImageUrl?: string
}

interface QuickAction {
  id: ImageFeedbackAction
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

const quickActions: QuickAction[] = [
  {
    id: 'regenerate',
    label: 'Regenerate',
    icon: RefreshCw,
    description: 'Generate a new version',
  },
  {
    id: 'change_style',
    label: 'Change Style',
    icon: Palette,
    description: 'Try a different visual style',
  },
  {
    id: 'more_detail',
    label: 'More Detail',
    icon: ZoomIn,
    description: 'Add more information',
  },
  {
    id: 'simplify',
    label: 'Simplify',
    icon: Minimize2,
    description: 'Make it cleaner',
  },
  {
    id: 'different_layout',
    label: 'Different Layout',
    icon: LayoutGrid,
    description: 'Try another arrangement',
  },
]

interface ImageFeedbackProps {
  imageId: string
  originalPrompt?: string
  originalImageUrl?: string
  onFeedback: (feedback: ImageFeedbackData) => void
  disabled?: boolean
  className?: string
}

export function ImageFeedback({
  imageId,
  originalPrompt,
  originalImageUrl,
  onFeedback,
  disabled = false,
  className,
}: ImageFeedbackProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [customText, setCustomText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleQuickAction = useCallback(
    (action: ImageFeedbackAction) => {
      if (disabled || isSubmitting) return

      setIsSubmitting(true)
      onFeedback({
        type: 'quick_action',
        imageId,
        action,
        originalPrompt,
        originalImageUrl,
      })

      // Reset after a short delay
      setTimeout(() => setIsSubmitting(false), 500)
    },
    [imageId, originalPrompt, originalImageUrl, onFeedback, disabled, isSubmitting]
  )

  const handleCustomSubmit = useCallback(() => {
    if (disabled || isSubmitting || !customText.trim()) return

    setIsSubmitting(true)
    onFeedback({
      type: 'custom_text',
      imageId,
      customText: customText.trim(),
      originalPrompt,
      originalImageUrl,
    })

    setCustomText('')
    setTimeout(() => setIsSubmitting(false), 500)
  }, [imageId, customText, originalPrompt, originalImageUrl, onFeedback, disabled, isSubmitting])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleCustomSubmit()
      }
    },
    [handleCustomSubmit]
  )

  return (
    <div
      className={cn(
        'border-t border-slate-200 dark:border-slate-700 bg-gradient-to-b from-slate-50 to-white dark:from-slate-800/50 dark:to-slate-900/50',
        className
      )}
    >
      {/* Feedback Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
        disabled={disabled}
      >
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          Refine this image
        </span>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {/* Expandable Content */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200 ease-in-out',
          isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="px-4 pb-4 space-y-4">
          {/* Quick Actions */}
          <div className="space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">
              Quick Actions
            </p>
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action) => {
                const Icon = action.icon
                return (
                  <Button
                    key={action.id}
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickAction(action.id)}
                    disabled={disabled || isSubmitting}
                    className={cn(
                      'flex items-center gap-1.5 text-xs',
                      'hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300',
                      'dark:hover:bg-purple-900/20 dark:hover:text-purple-300 dark:hover:border-purple-700',
                      'transition-all duration-150'
                    )}
                    title={action.description}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {action.label}
                  </Button>
                )
              })}
            </div>
          </div>

          {/* Custom Text Input */}
          <div className="space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">
              Custom Refinement
            </p>
            <div className="flex gap-2">
              <Textarea
                placeholder="Describe how you'd like to refine this image..."
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={disabled || isSubmitting}
                className={cn(
                  'flex-1 min-h-[60px] max-h-[120px] resize-none text-sm',
                  'focus:ring-purple-500 focus:border-purple-500'
                )}
              />
              <Button
                onClick={handleCustomSubmit}
                disabled={disabled || isSubmitting || !customText.trim()}
                size="icon"
                className={cn(
                  'self-end h-10 w-10',
                  'bg-purple-600 hover:bg-purple-700',
                  'disabled:opacity-50'
                )}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>

      {/* Collapsed Quick Buttons */}
      {!isExpanded && (
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
          {quickActions.slice(0, 3).map((action) => {
            const Icon = action.icon
            return (
              <Button
                key={action.id}
                variant="ghost"
                size="sm"
                onClick={() => handleQuickAction(action.id)}
                disabled={disabled || isSubmitting}
                className={cn(
                  'flex items-center gap-1.5 text-xs shrink-0',
                  'text-slate-500 hover:text-purple-600',
                  'dark:text-slate-400 dark:hover:text-purple-400'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {action.label}
              </Button>
            )
          })}
        </div>
      )}
    </div>
  )
}
