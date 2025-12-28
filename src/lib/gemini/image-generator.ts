import { GoogleGenerativeAI } from '@google/generative-ai'

// Initialize the Gemini API client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

// Image generation model
// Based on: https://ai.google.dev/gemini-api/docs/image-generation
const IMAGE_MODEL = 'gemini-3-pro-image-preview'

// Aspect ratio options
type AspectRatio = '1:1' | '16:9' | '4:3' | '3:4' | '9:16'

/**
 * Generate an image using Gemini Image Generation
 * Uses gemini-3-pro-image-preview for high-quality professional images
 * Based on: https://ai.google.dev/gemini-api/docs/image-generation
 */
export async function generateImage(prompt: string, options?: {
  style?: 'chart' | 'infographic' | 'diagram' | 'illustration' | 'financial' | 'demonstration'
  aspectRatio?: AspectRatio
}): Promise<{
  imageData: string
  mimeType: string
  prompt: string
  imageUrl?: string
}> {
  try {
    // Always use gemini-3-pro-image-preview for high-quality image generation
    const model = genAI.getGenerativeModel({
      model: IMAGE_MODEL,
      generationConfig: {
        // @ts-expect-error - responseModalities is a valid config for image generation
        responseModalities: ['Text', 'Image'],
      },
    })

    // Enhance prompt based on style for better results
    let enhancedPrompt = prompt
    if (options?.style) {
      const stylePrompts = {
        chart: 'Create a professional financial chart visualization. Clean, corporate style with clear labels, legends, and a modern color palette. High resolution, suitable for business presentations.',
        infographic: 'Design a modern business infographic with clear visual hierarchy, icons, data visualization elements, and professional typography. Corporate color scheme.',
        diagram: 'Create a clear technical diagram with labeled components, smooth connections, and professional styling. Suitable for business documentation.',
        illustration: 'Create a professional business illustration with modern, clean aesthetics, soft gradients, and corporate styling.',
        financial: 'Create a professional financial visualization with clean lines, corporate blue/green color scheme, clear data representation, and suitable for executive presentations.',
        demonstration: 'Create a clear, educational demonstration image that visually explains the concept. Use professional styling with clear labels, step-by-step visuals if applicable, and modern design suitable for presentations.',
      }
      enhancedPrompt = `${stylePrompts[options.style]} ${prompt}`
    }

    // Add aspect ratio guidance if specified
    if (options?.aspectRatio) {
      enhancedPrompt = `${enhancedPrompt} Image aspect ratio: ${options.aspectRatio}.`
    }

    // Generate the image using the Gemini API with image response modality
    const result = await model.generateContent(enhancedPrompt)
    const response = result.response
    const candidates = response.candidates

    // Check for image data in the response
    if (candidates && candidates.length > 0) {
      const parts = candidates[0].content?.parts || []

      for (const part of parts) {
        // Check if the part contains inline image data
        if ('inlineData' in part && part.inlineData) {
          return {
            imageData: part.inlineData.data || '',
            mimeType: part.inlineData.mimeType || 'image/png',
            prompt: enhancedPrompt,
          }
        }
      }
    }

    // If no image data found, the model might not support image generation
    // Return empty data with the prompt for debugging
    console.warn('Gemini response did not contain image data. Model may not support image generation.')
    return {
      imageData: '',
      mimeType: 'image/png',
      prompt: enhancedPrompt,
    }

  } catch (error) {
    console.error('Image generation error:', error)

    // Handle specific error cases
    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('not supported')) {
        throw new Error('Image generation model not available. Please check your API access.')
      }
    }

    throw new Error(`Failed to generate image: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Generate a demonstration image for explaining financial concepts
 * This creates visual aids to help explain analysis results
 */
export async function generateDemonstrationImage(
  concept: string,
  context?: string
): Promise<{ imageData: string; mimeType: string; prompt: string }> {
  const prompt = `Create a professional demonstration image that visually explains:

${concept}

${context ? `Context: ${context}` : ''}

Requirements:
- Clear, educational visualization
- Use icons, diagrams, or visual metaphors to explain the concept
- Professional corporate styling with blue/green color palette
- Clean typography with clear labels
- Suitable for business presentations
- Modern, minimalist design
- White or light gradient background`

  return await generateImage(prompt, { style: 'demonstration', aspectRatio: '16:9' })
}

/**
 * Generate a chart image using Gemini
 * Returns both image data and prompt for debugging
 */
export async function generateChartImage(
  chartDescription: string,
  data: any[]
): Promise<{ imageData: string; mimeType: string; prompt: string }> {
  const dataDescription = JSON.stringify(data.slice(0, 10)) // Limit data for prompt

  const prompt = `Create a professional financial chart visualization:
${chartDescription}

Data sample: ${dataDescription}

Requirements:
- Clear axis labels with proper formatting
- Legend if multiple series
- Color scheme: blue (#3B82F6) for primary, emerald (#10B981) for positive, red (#EF4444) for negative
- Subtle grid lines for readability
- Professional title at the top
- Clean white background
- Modern, minimalist style suitable for executive presentations`

  return await generateImage(prompt, { style: 'chart', aspectRatio: '16:9' })
}

/**
 * Generate an infographic image
 * Returns both image data and prompt for debugging
 */
export async function generateInfographic(
  title: string,
  sections: { label: string; value: string | number }[]
): Promise<{ imageData: string; mimeType: string; prompt: string }> {
  const sectionsText = sections.map(s => `- ${s.label}: ${s.value}`).join('\n')

  const prompt = `Create a professional business infographic:

Title: ${title}

Key Metrics:
${sectionsText}

Requirements:
- Modern corporate design with clear visual hierarchy
- Meaningful icons for each metric
- Professional color palette (blues, greens, subtle grays)
- Clean typography that's easy to read at a glance
- Visual separators between sections
- Suitable for presentations and reports
- High contrast for readability`

  return await generateImage(prompt, { style: 'infographic', aspectRatio: '4:3' })
}

/**
 * Generate a financial dashboard visualization
 * Creates a comprehensive financial visual with multiple metrics
 */
export async function generateFinancialDashboard(
  title: string,
  metrics: {
    name: string
    value: number | string
    change?: number
    trend?: 'up' | 'down' | 'neutral'
  }[],
  period?: string
): Promise<{ imageData: string; mimeType: string; prompt: string }> {
  const metricsText = metrics
    .map(m => {
      let metricStr = `- ${m.name}: ${m.value}`
      if (m.change !== undefined) {
        metricStr += ` (${m.change >= 0 ? '+' : ''}${m.change}%)`
      }
      if (m.trend) {
        metricStr += ` [${m.trend}]`
      }
      return metricStr
    })
    .join('\n')

  const prompt = `Create a professional financial dashboard visualization:

Title: ${title}
${period ? `Period: ${period}` : ''}

Key Performance Indicators:
${metricsText}

Design Requirements:
- Executive dashboard style with clean, modern layout
- Each metric displayed in its own card with clear typography
- Use green for positive trends, red for negative, gray for neutral
- Include small trend arrows or sparklines where appropriate
- Professional color scheme suitable for boardroom presentations
- Clear visual hierarchy emphasizing the most important metrics
- White background with subtle shadows for depth`

  return await generateImage(prompt, { style: 'financial', aspectRatio: '16:9' })
}

/**
 * Analyze an image using Gemini Vision
 */
export async function analyzeImage(
  imageData: string,
  mimeType: string,
  analysisPrompt: string
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
    })

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageData,
              },
            },
            {
              text: analysisPrompt || 'Analyze this image and extract any financial or business-relevant information.',
            },
          ],
        },
      ],
    })

    const response = await result.response
    return response.text()
  } catch (error) {
    console.error('Image analysis error:', error)
    throw new Error(`Failed to analyze image: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Analyze a video using Gemini Vision
 * Based on: https://ai.google.dev/gemini-api/docs/video
 */
export async function analyzeVideo(
  videoData: string,
  mimeType: string,
  analysisPrompt: string
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
    })

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: videoData,
              },
            },
            {
              text: analysisPrompt || 'Analyze this video and extract key information, dialogue, and visual elements.',
            },
          ],
        },
      ],
    })

    const response = await result.response
    return response.text()
  } catch (error) {
    console.error('Video analysis error:', error)
    throw new Error(`Failed to analyze video: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Generate a comparison visualization
 * Creates side-by-side or stacked comparisons of financial data
 */
export async function generateComparisonVisual(
  title: string,
  comparisons: {
    label: string
    values: { name: string; value: number }[]
  }[],
  comparisonType: 'side-by-side' | 'stacked' | 'percentage' = 'side-by-side'
): Promise<{ imageData: string; mimeType: string; prompt: string }> {
  const comparisonText = comparisons
    .map(c => {
      const values = c.values.map(v => `${v.name}: ${v.value}`).join(', ')
      return `${c.label}: ${values}`
    })
    .join('\n')

  const prompt = `Create a professional comparison visualization:

Title: ${title}
Comparison Type: ${comparisonType}

Data:
${comparisonText}

Requirements:
- ${comparisonType === 'side-by-side' ? 'Bars displayed side by side for easy comparison' : ''}
- ${comparisonType === 'stacked' ? 'Stacked bar chart showing composition' : ''}
- ${comparisonType === 'percentage' ? 'Show percentage breakdown with clear labels' : ''}
- Clear color coding for different categories
- Professional corporate styling
- Legend explaining all colors
- Clean, white background
- Suitable for financial presentations`

  return await generateImage(prompt, { style: 'chart', aspectRatio: '16:9' })
}
