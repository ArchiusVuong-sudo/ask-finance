/**
 * Image Feedback Utilities
 *
 * Utilities for constructing and parsing image refinement messages
 * that the agent can understand and process.
 */

import type { ImageFeedbackData, ImageFeedbackAction } from '@/components/canvas/image-feedback'

// Re-export types for consumers
export type { ImageFeedbackData, ImageFeedbackAction }

// Marker prefix for image refinement requests
const IMAGE_REFINEMENT_PREFIX = '[Image Refinement Request]'

/**
 * Action descriptions for the agent to understand the intent
 */
const actionDescriptions: Record<ImageFeedbackAction, string> = {
  regenerate: 'Please regenerate this image with a fresh approach while maintaining the same data and context.',
  change_style: 'Please create a new version of this image with a different visual style (try professional/corporate, modern/minimalist, or infographic style).',
  more_detail: 'Please regenerate this image with more detail, including additional data points, annotations, and explanatory elements.',
  simplify: 'Please simplify this image by reducing visual complexity, using cleaner design, and focusing on the key message.',
  different_layout: 'Please recreate this image with a different layout arrangement (try vertical, horizontal, grid, or radial layout).',
}

/**
 * Build a user message for image feedback that the agent can parse
 */
export function buildFeedbackMessage(feedback: ImageFeedbackData): string {
  const parts: string[] = [IMAGE_REFINEMENT_PREFIX]

  if (feedback.type === 'quick_action' && feedback.action) {
    parts.push(`\nAction: ${feedback.action}`)
    parts.push(`\n${actionDescriptions[feedback.action]}`)
  } else if (feedback.type === 'custom_text' && feedback.customText) {
    parts.push(`\nAction: custom`)
    parts.push(`\nUser request: ${feedback.customText}`)
  }

  parts.push(`\nImage ID: ${feedback.imageId}`)

  if (feedback.originalPrompt) {
    parts.push(`\nOriginal prompt: "${feedback.originalPrompt}"`)
  }

  return parts.join('')
}

/**
 * Parsed image refinement request
 */
export interface ParsedImageRefinement {
  action: ImageFeedbackAction | 'custom'
  imageId: string
  customText?: string
  originalPrompt?: string
  rawRequest: string
}

/**
 * Check if a message is an image refinement request
 */
export function isImageRefinementRequest(message: string): boolean {
  return message.trim().startsWith(IMAGE_REFINEMENT_PREFIX)
}

/**
 * Parse an image refinement request message
 */
export function parseImageRefinementRequest(message: string): ParsedImageRefinement | null {
  if (!isImageRefinementRequest(message)) {
    return null
  }

  const result: ParsedImageRefinement = {
    action: 'regenerate', // default
    imageId: '',
    rawRequest: message,
  }

  // Parse action
  const actionMatch = message.match(/Action:\s*(\w+)/i)
  if (actionMatch) {
    const action = actionMatch[1].toLowerCase()
    if (action === 'custom') {
      result.action = 'custom'
    } else if (isValidAction(action)) {
      result.action = action as ImageFeedbackAction
    }
  }

  // Parse image ID
  const imageIdMatch = message.match(/Image ID:\s*([^\n]+)/i)
  if (imageIdMatch) {
    result.imageId = imageIdMatch[1].trim()
  }

  // Parse custom text (for custom action)
  const customTextMatch = message.match(/User request:\s*([^\n]+)/i)
  if (customTextMatch) {
    result.customText = customTextMatch[1].trim()
  }

  // Parse original prompt
  const originalPromptMatch = message.match(/Original prompt:\s*"([^"]+)"/i)
  if (originalPromptMatch) {
    result.originalPrompt = originalPromptMatch[1].trim()
  }

  return result
}

/**
 * Check if a string is a valid action
 */
function isValidAction(action: string): boolean {
  return ['regenerate', 'change_style', 'more_detail', 'simplify', 'different_layout'].includes(action)
}

/**
 * Get prompt modification based on refinement action
 */
export function getRefinementPromptModifier(
  action: ImageFeedbackAction | 'custom',
  customText?: string,
  originalPrompt?: string
): string {
  const basePrompt = originalPrompt ? `Based on the previous image about: "${originalPrompt}"\n\n` : ''

  switch (action) {
    case 'regenerate':
      return `${basePrompt}Create a fresh version of this visualization with a new creative approach. Keep the same data and insights but present them differently.`

    case 'change_style':
      return `${basePrompt}Create a new version with a distinctly different visual style. Options:
- Professional corporate style with clean lines and muted colors
- Modern minimalist with bold typography and white space
- Colorful infographic style with icons and visual metaphors
Choose the most appropriate style for the data being presented.`

    case 'more_detail':
      return `${basePrompt}Create an enhanced version with more detail:
- Add additional data points or metrics
- Include explanatory annotations and callouts
- Add trend indicators and comparisons
- Include a legend or key if helpful
- Add context with labels and descriptions`

    case 'simplify':
      return `${basePrompt}Create a simplified, cleaner version:
- Focus on the single most important insight
- Remove non-essential elements
- Use a minimalist design approach
- Maximize white space
- Keep only critical labels and data`

    case 'different_layout':
      return `${basePrompt}Recreate with a completely different layout:
- Try a different orientation (horizontal vs vertical)
- Consider a grid or modular layout
- Experiment with asymmetric composition
- Try a circular or radial arrangement if appropriate
Choose the layout that best presents the data.`

    case 'custom':
      return `${basePrompt}${customText || 'Please refine the image based on user feedback.'}`

    default:
      return basePrompt || 'Please refine the image.'
  }
}

/**
 * Build complete image generation prompt with refinement context
 */
export function buildRefinementPrompt(
  parsed: ParsedImageRefinement,
  analysisContext?: string
): string {
  const modifier = getRefinementPromptModifier(
    parsed.action,
    parsed.customText,
    parsed.originalPrompt
  )

  const parts: string[] = [modifier]

  if (analysisContext) {
    parts.push('\n\n## Data Context from Analysis')
    parts.push(analysisContext)
  }

  parts.push('\n\nGenerate a refined image that addresses this feedback while maintaining accuracy with the underlying data.')

  return parts.join('\n')
}

/**
 * Generate a unique image ID for tracking
 */
export function generateImageId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
