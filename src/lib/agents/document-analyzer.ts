import Anthropic from '@anthropic-ai/sdk'

/**
 * Document Analyzer with Chart/Graph Reading
 * Based on: https://github.com/anthropics/claude-cookbooks/blob/main/multimodal/reading_charts_graphs_powerpoints.ipynb
 *
 * Provides capabilities for:
 * - PDF document analysis
 * - Chart and graph data extraction
 * - Slide deck narration for RAG
 * - Financial document understanding
 */

// Initialize Anthropic client with PDF beta support
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  defaultHeaders: {
    'anthropic-beta': 'pdfs-2024-09-25',
  },
})

const MODEL_NAME = 'claude-sonnet-4-20250514'

export interface DocumentAnalysisResult {
  summary: string
  extractedData?: Record<string, unknown>
  charts?: ChartData[]
  tables?: TableData[]
  keyMetrics?: KeyMetric[]
  narration?: string
}

export interface ChartData {
  title: string
  type: 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'other'
  dataPoints: Record<string, number | string>[]
  insights: string
}

export interface TableData {
  title: string
  headers: string[]
  rows: Record<string, string | number>[]
}

export interface KeyMetric {
  name: string
  value: string | number
  change?: number
  period?: string
  source?: string
}

/**
 * Extract content from XML tags
 */
function extractXml(content: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)
  const match = content.match(regex)
  return match ? match[1].trim() : ''
}

/**
 * Parse JSON safely
 */
function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    const cleaned = json.replace(/```json\n?|\n?```/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return fallback
  }
}

/**
 * Document Analyzer Class
 */
export class DocumentAnalyzer {
  /**
   * Analyze a PDF document for financial insights
   */
  async analyzePdf(
    base64Data: string,
    options?: {
      extractCharts?: boolean
      extractTables?: boolean
      generateNarration?: boolean
      specificQuestions?: string[]
    }
  ): Promise<DocumentAnalysisResult> {
    const results: DocumentAnalysisResult = {
      summary: '',
    }

    // Step 1: Get document summary
    const summaryResponse = await anthropic.messages.create({
      model: MODEL_NAME,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: `Analyze this financial document and provide:

<summary>
A comprehensive summary of the document's key points, focusing on financial data and insights.
</summary>

<document_type>
The type of document (earnings report, financial statement, presentation, etc.)
</document_type>

<time_period>
The time period covered by the document
</time_period>

<key_metrics>
JSON array of key metrics found:
[
  {"name": "metric_name", "value": "value", "change": percent_change, "period": "period"}
]
</key_metrics>`,
            },
          ],
        },
      ],
    })

    const summaryText =
      summaryResponse.content[0].type === 'text'
        ? summaryResponse.content[0].text
        : ''

    results.summary = extractXml(summaryText, 'summary')
    const metricsJson = extractXml(summaryText, 'key_metrics')
    results.keyMetrics = safeJsonParse<KeyMetric[]>(metricsJson, [])

    // Step 2: Extract charts if requested
    if (options?.extractCharts) {
      const chartsResponse = await anthropic.messages.create({
        model: MODEL_NAME,
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: `Identify and extract data from all charts and graphs in this document.

For each chart, provide:

<charts>
[
  {
    "title": "Chart title",
    "type": "bar|line|pie|area|scatter|other",
    "dataPoints": [{"label": "...", "value": ...}, ...],
    "insights": "Key insights from this chart"
  }
]
</charts>

Be precise with numbers. If you can't read exact values, provide your best estimate with a note.`,
              },
            ],
          },
        ],
      })

      const chartsText =
        chartsResponse.content[0].type === 'text'
          ? chartsResponse.content[0].text
          : ''
      const chartsJson = extractXml(chartsText, 'charts')
      results.charts = safeJsonParse<ChartData[]>(chartsJson, [])
    }

    // Step 3: Extract tables if requested
    if (options?.extractTables) {
      const tablesResponse = await anthropic.messages.create({
        model: MODEL_NAME,
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: `Extract all tables from this document.

For each table, provide:

<tables>
[
  {
    "title": "Table title or description",
    "headers": ["column1", "column2", ...],
    "rows": [{"column1": value1, "column2": value2, ...}, ...]
  }
]
</tables>

Preserve exact values and formatting where possible.`,
              },
            ],
          },
        ],
      })

      const tablesText =
        tablesResponse.content[0].type === 'text'
          ? tablesResponse.content[0].text
          : ''
      const tablesJson = extractXml(tablesText, 'tables')
      results.tables = safeJsonParse<TableData[]>(tablesJson, [])
    }

    // Step 4: Generate narration for RAG if requested
    if (options?.generateNarration) {
      results.narration = await this.generateNarration(base64Data)
    }

    // Step 5: Answer specific questions if provided
    if (options?.specificQuestions && options.specificQuestions.length > 0) {
      const extractedData: Record<string, unknown> = {}

      for (const question of options.specificQuestions) {
        const answerResponse = await anthropic.messages.create({
          model: MODEL_NAME,
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: base64Data,
                  },
                },
                {
                  type: 'text',
                  text: question,
                },
              ],
            },
          ],
        })

        const answer =
          answerResponse.content[0].type === 'text'
            ? answerResponse.content[0].text
            : ''
        extractedData[question] = answer
      }

      results.extractedData = extractedData
    }

    return results
  }

  /**
   * Generate detailed narration of a slide deck for RAG
   * This creates text descriptions of visual content for vector search
   */
  async generateNarration(base64Data: string): Promise<string> {
    const response = await anthropic.messages.create({
      model: MODEL_NAME,
      max_tokens: 16384,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: `You are narrating this financial document as if presenting to stakeholders.

Create a detailed text narration that describes EVERYTHING visible in the document, including:
- All text content
- Every chart and graph with specific data points
- Every table with all values
- Visual elements and their meaning
- Page-by-page breakdown

This narration will be used for search indexing, so do not leave any details un-narrated.
Vision-impaired users depend on this narration to understand the document.

Format your response as:

<narration>
<page id="1">
[Complete narration of page 1 with all visual elements described]
</page>

<page id="2">
[Complete narration of page 2...]
</page>
...
</narration>`,
            },
          ],
        },
      ],
    })

    const text =
      response.content[0].type === 'text' ? response.content[0].text : ''
    return extractXml(text, 'narration')
  }

  /**
   * Analyze an image (chart, graph, or financial visual)
   */
  async analyzeImage(
    base64Data: string,
    mimeType: string,
    prompt?: string
  ): Promise<{
    description: string
    extractedData?: Record<string, unknown>
  }> {
    const analysisPrompt = prompt || `Analyze this financial chart or image.

Describe:
1. The type of visualization
2. All data points visible (be precise with numbers)
3. Trends or patterns
4. Key insights

<description>
Your detailed description
</description>

<data>
JSON object with extracted numerical data
</data>`

    const response = await anthropic.messages.create({
      model: MODEL_NAME,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as
                  | 'image/jpeg'
                  | 'image/png'
                  | 'image/gif'
                  | 'image/webp',
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: analysisPrompt,
            },
          ],
        },
      ],
    })

    const text =
      response.content[0].type === 'text' ? response.content[0].text : ''

    const description = extractXml(text, 'description')
    const dataJson = extractXml(text, 'data')

    return {
      description: description || text,
      extractedData: dataJson ? safeJsonParse<Record<string, unknown>>(dataJson, {}) : undefined,
    }
  }

  /**
   * Compare multiple financial documents
   */
  async compareDocuments(
    documents: { name: string; base64Data: string }[],
    comparisonFocus?: string
  ): Promise<{
    comparison: string
    differences: string[]
    commonalities: string[]
    recommendation: string
  }> {
    // First, analyze each document individually
    const analyses = await Promise.all(
      documents.map(async (doc) => {
        const result = await this.analyzePdf(doc.base64Data, {
          extractCharts: true,
          extractTables: true,
        })
        return {
          name: doc.name,
          ...result,
        }
      })
    )

    // Then create comparison
    const comparisonPrompt = `Compare these financial documents:

${analyses
  .map(
    (a, i) => `
Document ${i + 1}: ${a.name}
Summary: ${a.summary}
Key Metrics: ${JSON.stringify(a.keyMetrics)}
`
  )
  .join('\n')}

${comparisonFocus ? `Focus on: ${comparisonFocus}` : ''}

Provide:

<comparison>
Detailed comparison of the documents
</comparison>

<differences>
["difference 1", "difference 2", ...]
</differences>

<commonalities>
["common point 1", "common point 2", ...]
</commonalities>

<recommendation>
Your recommendation based on the comparison
</recommendation>`

    const response = await anthropic.messages.create({
      model: MODEL_NAME,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: comparisonPrompt,
        },
      ],
    })

    const text =
      response.content[0].type === 'text' ? response.content[0].text : ''

    return {
      comparison: extractXml(text, 'comparison'),
      differences: safeJsonParse<string[]>(
        extractXml(text, 'differences'),
        []
      ),
      commonalities: safeJsonParse<string[]>(
        extractXml(text, 'commonalities'),
        []
      ),
      recommendation: extractXml(text, 'recommendation'),
    }
  }
}

// Export singleton instance
export const documentAnalyzer = new DocumentAnalyzer()
