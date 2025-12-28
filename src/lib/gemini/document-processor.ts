import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

interface ProcessingResult {
  content: string
  metadata: {
    documentType?: string
    title?: string
    pages?: number
    period?: string
    keyMetrics?: Record<string, unknown>
    tables?: unknown[]
  }
  chunks: {
    content: string
    metadata: Record<string, unknown>
  }[]
}

export async function processDocument(
  file: Buffer,
  mimeType: string,
  fileName: string
): Promise<ProcessingResult> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

  const base64Data = file.toString('base64')

  const prompt = `Analyze this financial document and extract:
1. Document type (e.g., P&L Statement, Balance Sheet, Budget Report, Invoice, etc.)
2. Title or description
3. Time period covered (if applicable)
4. Key financial metrics and figures
5. Any tables with their data
6. Full text content for search indexing

Format your response as JSON with the following structure:
{
  "documentType": "string",
  "title": "string",
  "period": "string or null",
  "keyMetrics": { "metricName": value },
  "tables": [{ "name": "string", "headers": [], "rows": [[]] }],
  "content": "full text content of the document"
}

Be thorough in extracting all text content for search purposes.`

  try {
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
      prompt,
    ])

    const response = result.response.text()

    // Parse JSON from response
    let parsed: {
      documentType?: string
      title?: string
      period?: string
      keyMetrics?: Record<string, unknown>
      tables?: unknown[]
      content?: string
    }

    try {
      // Extract JSON from the response (it might be wrapped in markdown code blocks)
      const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/) ||
                        response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0]
        parsed = JSON.parse(jsonStr)
      } else {
        throw new Error('No JSON found in response')
      }
    } catch {
      // If JSON parsing fails, use the raw response as content
      parsed = {
        content: response,
        documentType: 'unknown',
        title: fileName,
      }
    }

    const content = parsed.content || response

    // Create chunks for RAG
    const chunks = createChunks(content, {
      documentType: parsed.documentType,
      title: parsed.title,
      period: parsed.period,
    })

    return {
      content,
      metadata: {
        documentType: parsed.documentType,
        title: parsed.title,
        period: parsed.period,
        keyMetrics: parsed.keyMetrics,
        tables: parsed.tables,
      },
      chunks,
    }
  } catch (error) {
    console.error('Gemini processing error:', error)
    throw error
  }
}

function createChunks(
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

  return chunks
}

export async function processImage(
  file: Buffer,
  mimeType: string
): Promise<{
  description: string
  extractedText: string
  objects: string[]
}> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

  const base64Data = file.toString('base64')

  const prompt = `Analyze this image and provide:
1. A detailed description of what you see
2. Any text visible in the image (OCR)
3. Objects or elements identified

Format as JSON:
{
  "description": "detailed description",
  "extractedText": "all visible text",
  "objects": ["object1", "object2"]
}`

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    },
    prompt,
  ])

  const response = result.response.text()

  try {
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/) ||
                      response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0]
      return JSON.parse(jsonStr)
    }
  } catch {
    // Fallback
  }

  return {
    description: response,
    extractedText: '',
    objects: [],
  }
}
