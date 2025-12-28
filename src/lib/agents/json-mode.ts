import Anthropic from '@anthropic-ai/sdk'

/**
 * JSON Mode and Structured Output Helpers
 * Based on: https://github.com/anthropics/claude-cookbooks/blob/main/skills/json_mode.ipynb
 *
 * Provides reliable JSON extraction using:
 * 1. XML tag wrapping for structured responses
 * 2. JSON prefilling technique
 * 3. Schema validation
 */

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const MODEL_NAME = 'claude-sonnet-4-20250514'

/**
 * Extract JSON from XML-wrapped response
 */
export function extractJsonFromXml<T>(content: string, tagName: string = 'json'): T | null {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`)
  const match = content.match(regex)

  if (!match) return null

  try {
    // Clean up the JSON string
    const jsonStr = match[1]
      .trim()
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    return JSON.parse(jsonStr) as T
  } catch (error) {
    console.error('JSON parsing error:', error)
    return null
  }
}

/**
 * Request JSON output with XML wrapping technique
 * This is the most reliable method for getting structured data
 */
export async function requestJsonOutput<T>(
  prompt: string,
  schema: {
    description: string
    example: T
    properties?: Record<string, { type: string; description: string }>
  },
  options?: {
    model?: string
    maxTokens?: number
    temperature?: number
  }
): Promise<{ result: T | null; raw: string }> {
  const schemaDescription = schema.properties
    ? Object.entries(schema.properties)
        .map(([key, value]) => `  "${key}": ${value.type} // ${value.description}`)
        .join('\n')
    : JSON.stringify(schema.example, null, 2)

  const systemPrompt = `You are a helpful assistant that responds with structured JSON data.
When asked to provide data, wrap your JSON response in <json> tags.

Expected format:
${schema.description}

Schema:
{
${schemaDescription}
}

Example output:
<json>
${JSON.stringify(schema.example, null, 2)}
</json>

Always ensure your JSON is valid and matches the expected schema.`

  const response = await anthropic.messages.create({
    model: options?.model || MODEL_NAME,
    max_tokens: options?.maxTokens || 4096,
    temperature: options?.temperature ?? 0,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  const textContent = response.content.find((block) => block.type === 'text')
  const raw = textContent?.type === 'text' ? textContent.text : ''

  return {
    result: extractJsonFromXml<T>(raw, 'json'),
    raw,
  }
}

/**
 * JSON Prefill technique - more reliable for simple structures
 * Uses assistant prefilling to force JSON output
 */
export async function requestJsonWithPrefill<T>(
  prompt: string,
  options?: {
    model?: string
    maxTokens?: number
  }
): Promise<{ result: T | null; raw: string }> {
  const response = await anthropic.messages.create({
    model: options?.model || MODEL_NAME,
    max_tokens: options?.maxTokens || 4096,
    messages: [
      {
        role: 'user',
        content: `${prompt}\n\nRespond with valid JSON only.`,
      },
      {
        role: 'assistant',
        content: '{',
      },
    ],
  })

  const textContent = response.content.find((block) => block.type === 'text')
  const partialJson = textContent?.type === 'text' ? textContent.text : ''
  const fullJson = '{' + partialJson

  try {
    return {
      result: JSON.parse(fullJson) as T,
      raw: fullJson,
    }
  } catch {
    return {
      result: null,
      raw: fullJson,
    }
  }
}

/**
 * Financial data extraction schemas
 */
export interface FinancialMetric {
  name: string
  value: number
  unit: 'currency' | 'percentage' | 'ratio' | 'count'
  period?: string
  change?: number
  trend?: 'up' | 'down' | 'stable'
}

export interface VarianceAnalysis {
  category: string
  budget: number
  actual: number
  variance: number
  variancePercent: number
  status: 'favorable' | 'unfavorable' | 'neutral'
  explanation?: string
}

export interface ChartDataPoint {
  name: string
  [key: string]: string | number
}

export interface TableRow {
  [key: string]: string | number | boolean
}

/**
 * Extract financial metrics from text
 */
export async function extractFinancialMetrics(
  text: string,
  focus?: string
): Promise<FinancialMetric[]> {
  const prompt = `Extract all financial metrics from this text:

${text}

${focus ? `Focus on: ${focus}` : ''}

Return a JSON array of financial metrics.`

  const { result } = await requestJsonOutput<FinancialMetric[]>(prompt, {
    description: 'Array of financial metrics',
    example: [
      {
        name: 'Revenue',
        value: 1000000,
        unit: 'currency',
        period: 'Q4 2024',
        change: 15.5,
        trend: 'up',
      },
    ],
    properties: {
      name: { type: 'string', description: 'Metric name' },
      value: { type: 'number', description: 'Metric value' },
      unit: { type: 'string', description: 'Unit type: currency, percentage, ratio, or count' },
      period: { type: 'string', description: 'Time period (optional)' },
      change: { type: 'number', description: 'Percent change (optional)' },
      trend: { type: 'string', description: 'Trend direction: up, down, or stable (optional)' },
    },
  })

  return result || []
}

/**
 * Generate variance analysis data
 */
export async function generateVarianceAnalysis(
  budgetData: string,
  actualData: string
): Promise<VarianceAnalysis[]> {
  const prompt = `Analyze the variance between budget and actual data:

Budget Data:
${budgetData}

Actual Data:
${actualData}

Calculate variances and provide explanations.`

  const { result } = await requestJsonOutput<VarianceAnalysis[]>(prompt, {
    description: 'Array of variance analysis results',
    example: [
      {
        category: 'Sales',
        budget: 100000,
        actual: 95000,
        variance: -5000,
        variancePercent: -5,
        status: 'unfavorable',
        explanation: 'Lower than expected due to market conditions',
      },
    ],
  })

  return result || []
}

/**
 * Transform data for chart visualization
 */
export async function transformToChartData(
  rawData: string,
  chartType: 'line' | 'bar' | 'pie' | 'area',
  requirements?: string
): Promise<{
  chartType: string
  title: string
  data: ChartDataPoint[]
  xAxisKey: string
  yAxisKeys: string[]
}> {
  const prompt = `Transform this data for a ${chartType} chart visualization:

Data:
${rawData}

${requirements ? `Requirements: ${requirements}` : ''}

Provide the chart configuration.`

  const { result } = await requestJsonOutput<{
    chartType: string
    title: string
    data: ChartDataPoint[]
    xAxisKey: string
    yAxisKeys: string[]
  }>(prompt, {
    description: 'Chart configuration object',
    example: {
      chartType: 'bar',
      title: 'Quarterly Revenue',
      data: [
        { name: 'Q1', revenue: 100000, cost: 80000 },
        { name: 'Q2', revenue: 120000, cost: 85000 },
      ],
      xAxisKey: 'name',
      yAxisKeys: ['revenue', 'cost'],
    },
  })

  return (
    result || {
      chartType,
      title: 'Chart',
      data: [],
      xAxisKey: 'name',
      yAxisKeys: ['value'],
    }
  )
}

/**
 * Transform data for table display
 */
export async function transformToTableData(
  rawData: string,
  requirements?: string
): Promise<{
  title: string
  columns: string[]
  rows: TableRow[]
}> {
  const prompt = `Transform this data for a table display:

Data:
${rawData}

${requirements ? `Requirements: ${requirements}` : ''}

Provide the table configuration.`

  const { result } = await requestJsonOutput<{
    title: string
    columns: string[]
    rows: TableRow[]
  }>(prompt, {
    description: 'Table configuration object',
    example: {
      title: 'Financial Summary',
      columns: ['Category', 'Budget', 'Actual', 'Variance'],
      rows: [{ Category: 'Revenue', Budget: 100000, Actual: 95000, Variance: -5000 }],
    },
  })

  return (
    result || {
      title: 'Data Table',
      columns: [],
      rows: [],
    }
  )
}

/**
 * Structured response for financial questions
 */
export interface FinancialAnswer {
  answer: string
  confidence: 'high' | 'medium' | 'low'
  sources?: string[]
  calculations?: {
    formula: string
    values: Record<string, number>
    result: number
  }[]
  visualizations?: {
    type: 'chart' | 'table'
    description: string
    suggestedData: unknown
  }[]
  followUpQuestions?: string[]
}

/**
 * Get structured financial answer
 */
export async function getStructuredFinancialAnswer(
  question: string,
  context?: string
): Promise<FinancialAnswer> {
  const prompt = `Answer this financial question with structured data:

Question: ${question}

${context ? `Context:\n${context}` : ''}

Provide a comprehensive answer with calculations and visualization suggestions.`

  const { result } = await requestJsonOutput<FinancialAnswer>(prompt, {
    description: 'Structured financial answer',
    example: {
      answer: 'The ROI is 25%...',
      confidence: 'high',
      sources: ['Financial Statement Q4 2024'],
      calculations: [
        {
          formula: 'ROI = (Gain - Cost) / Cost * 100',
          values: { Gain: 125000, Cost: 100000 },
          result: 25,
        },
      ],
      visualizations: [
        {
          type: 'chart',
          description: 'ROI comparison over time',
          suggestedData: [
            { period: 'Q1', roi: 20 },
            { period: 'Q2', roi: 25 },
          ],
        },
      ],
      followUpQuestions: ['What factors influenced the ROI improvement?'],
    },
  })

  return (
    result || {
      answer: 'Unable to process the question.',
      confidence: 'low',
    }
  )
}

/**
 * Batch extraction - process multiple items efficiently
 */
export async function batchExtractMetrics(
  texts: string[]
): Promise<Map<number, FinancialMetric[]>> {
  const results = new Map<number, FinancialMetric[]>()

  // Process in parallel for efficiency
  const promises = texts.map(async (text, index) => {
    const metrics = await extractFinancialMetrics(text)
    return { index, metrics }
  })

  const resolved = await Promise.all(promises)
  resolved.forEach(({ index, metrics }) => {
    results.set(index, metrics)
  })

  return results
}

/**
 * Validate JSON against expected schema
 */
export function validateFinancialData<T extends Record<string, unknown>>(
  data: T,
  requiredFields: (keyof T)[]
): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = []

  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null) {
      missingFields.push(String(field))
    }
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
  }
}
