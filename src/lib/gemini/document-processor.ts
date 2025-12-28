import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY!)

// Use Gemini 3 Pro Preview for document processing
const GEMINI_MODEL = 'gemini-3-pro-preview'

// File size threshold for using Files API (10MB)
const FILE_API_THRESHOLD = 10 * 1024 * 1024

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

const DOCUMENT_ANALYSIS_PROMPT = `Analyze this financial document and extract:
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

Be thorough in extracting all text content for search purposes. For PDFs, analyze all visual elements including charts, diagrams, and tables.`

/**
 * Process a document using Gemini's native document understanding
 * Uses Files API for large documents (>10MB) for better performance
 */
export async function processDocument(
  file: Buffer,
  mimeType: string,
  fileName: string
): Promise<ProcessingResult> {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })
  const fileSize = file.length

  try {
    let result

    if (fileSize > FILE_API_THRESHOLD) {
      // Use Files API for large documents
      result = await processWithFilesAPI(file, mimeType, fileName, model)
    } else {
      // Use inline data for smaller documents
      result = await processInline(file, mimeType, model)
    }

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

/**
 * Process document using inline data (for smaller files)
 */
async function processInline(
  file: Buffer,
  mimeType: string,
  model: ReturnType<typeof genAI.getGenerativeModel>
) {
  const base64Data = file.toString('base64')

  return model.generateContent([
    {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    },
    DOCUMENT_ANALYSIS_PROMPT,
  ])
}

/**
 * Process document using Files API (for larger files)
 * Files are stored for 48 hours and automatically deleted
 */
async function processWithFilesAPI(
  file: Buffer,
  mimeType: string,
  fileName: string,
  model: ReturnType<typeof genAI.getGenerativeModel>
) {
  // Upload file to Gemini Files API
  const uploadResult = await fileManager.uploadFile(file, {
    mimeType,
    displayName: fileName,
  })

  // Wait for file to be processed
  let uploadedFile = await fileManager.getFile(uploadResult.file.name)
  while (uploadedFile.state === FileState.PROCESSING) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    uploadedFile = await fileManager.getFile(uploadResult.file.name)
  }

  if (uploadedFile.state === FileState.FAILED) {
    throw new Error(`File processing failed: ${uploadedFile.name}`)
  }

  try {
    // Generate content using the uploaded file
    const result = await model.generateContent([
      {
        fileData: {
          mimeType: uploadedFile.mimeType,
          fileUri: uploadedFile.uri,
        },
      },
      DOCUMENT_ANALYSIS_PROMPT,
    ])

    return result
  } finally {
    // Clean up the uploaded file
    try {
      await fileManager.deleteFile(uploadedFile.name)
    } catch (deleteError) {
      console.warn('Failed to delete uploaded file:', deleteError)
    }
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

/**
 * Process an image using Gemini's vision capabilities
 */
export async function processImage(
  file: Buffer,
  mimeType: string
): Promise<{
  description: string
  extractedText: string
  objects: string[]
}> {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })

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

/**
 * Process a PDF document with page-by-page analysis for very long documents
 * Useful when you need detailed analysis of each page
 */
export async function processLongDocument(
  file: Buffer,
  mimeType: string,
  fileName: string,
  options?: {
    summarize?: boolean
    extractTables?: boolean
  }
): Promise<ProcessingResult> {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })

  // Upload file to Files API (required for long documents)
  const uploadResult = await fileManager.uploadFile(file, {
    mimeType,
    displayName: fileName,
  })

  // Wait for file to be processed
  let uploadedFile = await fileManager.getFile(uploadResult.file.name)
  while (uploadedFile.state === FileState.PROCESSING) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    uploadedFile = await fileManager.getFile(uploadResult.file.name)
  }

  if (uploadedFile.state === FileState.FAILED) {
    throw new Error(`File processing failed: ${uploadedFile.name}`)
  }

  const customPrompt = `Analyze this financial document comprehensively:

1. Document Overview:
   - Document type and title
   - Time period covered
   - Number of pages/sections

2. Key Financial Data:
   - All monetary values and metrics
   - Percentages and ratios
   - Year-over-year comparisons if present

3. Tables and Charts:
   - Extract all tabular data
   - Describe any charts or graphs
   - Note any visual elements

4. Full Content:
   - Complete text extraction for search indexing
   ${options?.summarize ? '- Executive summary of key points' : ''}

Format your response as JSON:
{
  "documentType": "string",
  "title": "string",
  "period": "string or null",
  "pages": number,
  "keyMetrics": { "metricName": value },
  "tables": [{ "name": "string", "headers": [], "rows": [[]] }],
  "charts": [{ "type": "string", "description": "string", "data": {} }],
  "content": "full text content",
  ${options?.summarize ? '"summary": "executive summary",' : ''}
  "sections": [{ "title": "string", "content": "string" }]
}`

  try {
    const result = await model.generateContent([
      {
        fileData: {
          mimeType: uploadedFile.mimeType,
          fileUri: uploadedFile.uri,
        },
      },
      customPrompt,
    ])

    const response = result.response.text()

    let parsed: any = {}
    try {
      const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/) ||
                        response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0]
        parsed = JSON.parse(jsonStr)
      }
    } catch {
      parsed = { content: response, documentType: 'unknown', title: fileName }
    }

    const content = parsed.content || response

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
        pages: parsed.pages,
        period: parsed.period,
        keyMetrics: parsed.keyMetrics,
        tables: parsed.tables,
      },
      chunks,
    }
  } finally {
    // Clean up
    try {
      await fileManager.deleteFile(uploadedFile.name)
    } catch (deleteError) {
      console.warn('Failed to delete uploaded file:', deleteError)
    }
  }
}
