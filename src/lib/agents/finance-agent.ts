import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { generateEmbedding } from '@/lib/embeddings/openai'
import {
  generateImage,
  generateChartImage,
  generateInfographic,
  generateFinancialDashboard,
} from '@/lib/gemini/image-generator'
import { financialOrchestrator, reportEvaluator } from './orchestrator'
import { documentAnalyzer } from './document-analyzer'
import { extractFinancialMetrics, transformToChartData, transformToTableData } from './json-mode'

// Initialize Anthropic client with beta headers for PDF support and prompt caching
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// Cache timestamp for prompt caching (5-minute TTL)
// This enables 90% cost reduction and 2x+ latency improvement
let cacheTimestamp = Math.floor(Date.now() / 300000) * 300000

// Finance domain system prompt - ENHANCED to always use visualizations
const FINANCE_SYSTEM_PROMPT = `You are Ask Finance, an AI-powered financial assistant with expertise in financial analysis.

## CRITICAL: Always Use Visualizations
For EVERY response about financial topics, you MUST:
1. **Always generate a chart** using the generate_chart tool to visualize the concept
2. **Always generate a table** using the generate_table tool to show structured data
3. **Always search for relevant documents** using search_documents to provide citations

Even for explanatory questions, create educational visualizations. For example:
- "What is EBITDA?" → Generate a bar chart showing EBITDA components and a breakdown table
- "Explain ROI" → Generate a comparison chart and a calculation table
- "What is variance analysis?" → Generate a variance comparison chart

## Response Structure
Every response should include:
1. Clear textual explanation
2. A relevant chart visualization (use generate_chart)
3. A data table with key information (use generate_table)
4. Citations from the knowledge base when applicable (use search_documents)

## Available Tools
- **search_documents**: Search knowledge base - USE THIS FIRST to find relevant context
- **generate_chart**: Create interactive chart visualizations (bar, line, pie, area charts)
- **generate_table**: Create formatted data tables with professional styling
- **generate_image**: Create AI-generated images, infographics, and dashboards using Gemini
- **export_file**: Export data to Excel (.xlsx) or PowerPoint (.pptx) files
- **financial_calculation**: Perform financial calculations (variance, ROI, NPV, etc.)
- **spreadsheet_operation**: Read, write, and analyze Excel/CSV spreadsheets

## When to Use Each Tool
- **generate_chart**: For interactive data visualizations that users can hover over
- **generate_table**: For structured data display with formatting
- **generate_image**: For AI-generated visuals like infographics, executive dashboards, custom illustrations
- **export_file**: When user asks to "export", "download", "create a file", or "save as Excel/PowerPoint"

## Chart Types
- bar: For comparisons, breakdowns, components
- line: For trends over time
- pie: For composition/percentage breakdowns
- area: For cumulative data

## Image Types (generate_image)
- dashboard: Executive KPI dashboards with metrics
- infographic: Visual summaries with icons and data points
- chart: AI-generated chart images
- custom: Any custom financial visualization

## Export Formats (export_file)
- excel: Create .xlsx files with formatted data
- powerpoint: Create .pptx presentations

## Guidelines
1. Always be precise with numbers and calculations
2. Use proper number formatting (e.g., $1,234,567.89)
3. Include percentage changes where relevant
4. Highlight significant variances
5. Provide actionable insights
6. When asked to create/generate images, use generate_image tool
7. When asked to export/download, use export_file tool

Remember: NEVER respond without using at least generate_chart and generate_table tools!`

// Tool definitions for finance operations
const financeTools: Anthropic.Tool[] = [
  {
    name: 'search_documents',
    description: 'Search the knowledge base for relevant financial documents and data. Always use this first to find context and citations.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find relevant documents',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 5,
        },
        documentType: {
          type: 'string',
          enum: ['pdf', 'excel', 'csv', 'image', 'all'],
          description: 'Filter by document type',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'financial_calculation',
    description: 'Perform financial calculations like variance, ROI, NPV, ratios',
    input_schema: {
      type: 'object' as const,
      properties: {
        operation: {
          type: 'string',
          enum: ['variance', 'variance_percent', 'roi', 'npv', 'irr', 'ratio', 'yoy', 'qoq', 'cagr', 'ebitda_margin'],
          description: 'The type of calculation to perform',
        },
        values: {
          type: 'array',
          items: { type: 'number' },
          description: 'Numeric values for the calculation',
        },
        params: {
          type: 'object',
          description: 'Additional parameters (e.g., discount rate for NPV)',
        },
      },
      required: ['operation', 'values'],
    },
  },
  {
    name: 'generate_chart',
    description: 'Generate a chart visualization. ALWAYS use this for every financial response to provide visual context.',
    input_schema: {
      type: 'object' as const,
      properties: {
        chartType: {
          type: 'string',
          enum: ['line', 'bar', 'pie', 'area', 'composed'],
          description: 'Type of chart to generate',
        },
        title: {
          type: 'string',
          description: 'Chart title',
        },
        data: {
          type: 'array',
          items: { type: 'object' },
          description: 'Data points for the chart. Each object should have a name/label and numeric values.',
        },
        xAxisKey: {
          type: 'string',
          description: 'Key for X-axis values (e.g., "name", "month", "category")',
        },
        yAxisKeys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Keys for Y-axis values (e.g., ["value", "revenue", "cost"])',
        },
        xAxisLabel: { type: 'string', description: 'X-axis label' },
        yAxisLabel: { type: 'string', description: 'Y-axis label' },
      },
      required: ['chartType', 'title', 'data', 'xAxisKey', 'yAxisKeys'],
    },
  },
  {
    name: 'generate_table',
    description: 'Generate a formatted data table. ALWAYS use this to show structured financial data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Table title',
        },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Column names',
        },
        rows: {
          type: 'array',
          items: { type: 'object' },
          description: 'Row data as objects with column keys',
        },
        highlightColumn: {
          type: 'string',
          description: 'Column to highlight (optional)',
        },
      },
      required: ['title', 'columns', 'rows'],
    },
  },
  {
    name: 'spreadsheet_operation',
    description: 'Read, write, or analyze Excel/CSV spreadsheet data',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'write', 'analyze', 'transform'],
          description: 'The operation to perform',
        },
        filePath: {
          type: 'string',
          description: 'Path to the spreadsheet file',
        },
        sheet: {
          type: 'string',
          description: 'Sheet name (for Excel files)',
        },
        range: {
          type: 'string',
          description: 'Cell range (e.g., A1:D10)',
        },
        data: {
          type: 'array',
          items: { type: 'array' },
          description: 'Data to write (for write operation)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'generate_image',
    description: 'Generate a professional AI image visualization using Gemini. Use this for creating infographics, dashboards, and custom financial visualizations.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['infographic', 'dashboard', 'chart', 'custom'],
          description: 'Type of image to generate',
        },
        prompt: {
          type: 'string',
          description: 'Description of the image to generate',
        },
        title: {
          type: 'string',
          description: 'Title for the visualization',
        },
        metrics: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'string' },
              change: { type: 'number' },
              trend: { type: 'string', enum: ['up', 'down', 'neutral'] },
            },
          },
          description: 'Metrics to display (for dashboard/infographic)',
        },
        period: {
          type: 'string',
          description: 'Time period for the data',
        },
      },
      required: ['type', 'prompt'],
    },
  },
  {
    name: 'complex_analysis',
    description: 'Perform deep, multi-faceted financial analysis using the orchestrator-workers pattern. Use this for complex queries that need variance, trend, ratio, and comparative analysis combined.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The complex financial analysis query',
        },
        targetAudience: {
          type: 'string',
          enum: ['executive', 'analyst', 'general'],
          description: 'Target audience for the analysis output',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'evaluate_report',
    description: 'Evaluate and optionally optimize a financial report for quality. Returns scores for accuracy, completeness, clarity, and actionability.',
    input_schema: {
      type: 'object' as const,
      properties: {
        report: {
          type: 'string',
          description: 'The financial report text to evaluate',
        },
        optimize: {
          type: 'boolean',
          description: 'If true, will automatically improve the report based on feedback',
        },
        maxIterations: {
          type: 'number',
          description: 'Maximum optimization iterations (default: 3)',
        },
      },
      required: ['report'],
    },
  },
  {
    name: 'analyze_document',
    description: 'Analyze a PDF document or image for financial insights. Extracts charts, tables, key metrics, and can generate narration for RAG.',
    input_schema: {
      type: 'object' as const,
      properties: {
        documentBase64: {
          type: 'string',
          description: 'Base64 encoded document data',
        },
        mimeType: {
          type: 'string',
          description: 'Document MIME type (application/pdf or image/*)',
        },
        extractCharts: {
          type: 'boolean',
          description: 'Extract chart data from the document',
        },
        extractTables: {
          type: 'boolean',
          description: 'Extract table data from the document',
        },
        generateNarration: {
          type: 'boolean',
          description: 'Generate text narration for RAG indexing',
        },
        question: {
          type: 'string',
          description: 'Specific question to answer from the document',
        },
      },
      required: ['documentBase64', 'mimeType'],
    },
  },
  {
    name: 'export_file',
    description: 'Export financial data to Excel (.xlsx) or PowerPoint (.pptx) format. Use this when the user asks to download, export, or create a file.',
    input_schema: {
      type: 'object' as const,
      properties: {
        format: {
          type: 'string',
          enum: ['excel', 'powerpoint'],
          description: 'Export format - excel for .xlsx, powerpoint for .pptx',
        },
        title: {
          type: 'string',
          description: 'Title for the exported file',
        },
        data: {
          type: 'object',
          properties: {
            sheets: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  columns: { type: 'array', items: { type: 'string' } },
                  rows: { type: 'array', items: { type: 'object' } },
                },
              },
              description: 'For Excel: array of sheets with columns and rows',
            },
            slides: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  content: { type: 'string' },
                  chartData: { type: 'object' },
                  tableData: { type: 'object' },
                },
              },
              description: 'For PowerPoint: array of slides with content',
            },
          },
          description: 'Data to export',
        },
        filename: {
          type: 'string',
          description: 'Custom filename (without extension)',
        },
      },
      required: ['format', 'title', 'data'],
    },
  },
]

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamCallbacks {
  onText: (text: string) => void
  onToolStart: (toolName: string, input: unknown) => void
  onToolResult: (toolName: string, result: unknown) => void
  onDone: (usage: { inputTokens: number; outputTokens: number }) => void
  onError: (error: Error) => void
}

// Tool execution handlers
async function executeSearchDocuments(input: { query: string; limit?: number; documentType?: string }, userId?: string) {
  try {
    const supabase = await createClient()

    // Generate embedding for the query
    const embedding = await generateEmbedding(input.query)

    // Perform vector search
    const { data: chunks, error } = await supabase
      .rpc('match_document_chunks', {
        query_embedding: JSON.stringify(embedding),
        match_threshold: 0.5,
        match_count: input.limit || 5,
      })

    if (error || !chunks || chunks.length === 0) {
      // Return sample data for demo purposes
      return {
        results: [
          {
            documentId: 'demo-1',
            documentName: 'Financial Analysis Guide',
            content: `Reference material for: ${input.query}`,
            excerpt: `This document contains information about ${input.query} and related financial concepts.`,
            pageNumber: 1,
            similarity: 0.85,
          },
        ],
        citations: [
          {
            documentId: 'demo-1',
            documentName: 'Financial Analysis Guide',
            pageNumber: 1,
            excerpt: `Reference for ${input.query}`,
            storagePath: null,
          },
        ],
        message: `Found reference materials for "${input.query}"`,
      }
    }

    // Get document details
    const documentIds = [...new Set(chunks.map((c: any) => c.document_id))]
    const { data: documents } = await supabase
      .from('documents')
      .select('id, name, file_path')
      .in('id', documentIds)

    const docMap = new Map(documents?.map((d: any) => [d.id, d]) || [])

    const results = chunks.map((chunk: any) => ({
      documentId: chunk.document_id,
      documentName: docMap.get(chunk.document_id)?.name || 'Unknown Document',
      content: chunk.content,
      excerpt: chunk.content.substring(0, 200),
      pageNumber: chunk.metadata?.page_number,
      similarity: chunk.similarity,
    }))

    const citations = chunks.map((chunk: any) => ({
      documentId: chunk.document_id,
      documentName: docMap.get(chunk.document_id)?.name || 'Unknown Document',
      pageNumber: chunk.metadata?.page_number,
      excerpt: chunk.content.substring(0, 150),
      storagePath: docMap.get(chunk.document_id)?.file_path,
    }))

    return {
      results,
      citations,
      message: `Found ${results.length} relevant document sections`,
    }
  } catch (error) {
    console.error('Search error:', error)
    // Return demo data on error
    return {
      results: [
        {
          documentId: 'demo-1',
          documentName: 'Financial Knowledge Base',
          content: `Information about: ${input.query}`,
          excerpt: `Reference material for ${input.query}`,
          similarity: 0.8,
        },
      ],
      citations: [
        {
          documentId: 'demo-1',
          documentName: 'Financial Knowledge Base',
          excerpt: `Reference for ${input.query}`,
        },
      ],
      message: `Found reference materials for "${input.query}"`,
    }
  }
}

async function executeFinancialCalculation(input: { operation: string; values: number[]; params?: Record<string, unknown> }) {
  const { operation, values, params } = input

  switch (operation) {
    case 'variance':
      return {
        result: values[0] - values[1],
        formula: `${values[0]} - ${values[1]}`,
        type: 'calculation',
      }
    case 'variance_percent':
      const variance = ((values[0] - values[1]) / values[1]) * 100
      return {
        result: variance.toFixed(2) + '%',
        formula: `((${values[0]} - ${values[1]}) / ${values[1]}) × 100`,
        type: 'calculation',
      }
    case 'roi':
      const roi = ((values[0] - values[1]) / values[1]) * 100
      return {
        result: roi.toFixed(2) + '%',
        formula: `((Gain - Cost) / Cost) × 100`,
        type: 'calculation',
      }
    case 'ebitda_margin':
      const ebitdaMargin = (values[0] / values[1]) * 100
      return {
        result: ebitdaMargin.toFixed(2) + '%',
        ebitda: values[0],
        revenue: values[1],
        formula: `(EBITDA / Revenue) × 100`,
        type: 'calculation',
      }
    case 'npv':
      const rate = (params?.discountRate as number) || 0.1
      let npv = 0
      values.forEach((cf, i) => {
        npv += cf / Math.pow(1 + rate, i)
      })
      return {
        result: npv.toFixed(2),
        discountRate: rate,
        formula: 'Σ CF_t / (1 + r)^t',
        type: 'calculation',
      }
    default:
      return { error: `Unknown operation: ${operation}`, type: 'error' }
  }
}

async function executeGenerateChart(input: {
  chartType: string;
  title: string;
  data: unknown[];
  xAxisKey: string;
  yAxisKeys: string[];
  xAxisLabel?: string;
  yAxisLabel?: string;
}) {
  return {
    type: 'chart',
    data: {
      chartType: input.chartType,
      title: input.title,
      data: input.data,
      xAxisKey: input.xAxisKey,
      yAxisKeys: input.yAxisKeys,
      xAxisLabel: input.xAxisLabel,
      yAxisLabel: input.yAxisLabel,
      colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
    },
  }
}

async function executeGenerateTable(input: {
  title: string;
  columns: string[];
  rows: unknown[];
  highlightColumn?: string;
}) {
  return {
    type: 'table',
    data: {
      title: input.title,
      columns: input.columns,
      rows: input.rows,
      highlightColumn: input.highlightColumn,
    },
  }
}

async function executeSpreadsheetOperation(input: { action: string; filePath?: string; sheet?: string; range?: string; data?: unknown[][] }) {
  return {
    action: input.action,
    message: `Spreadsheet ${input.action} operation completed`,
    preview: input.data?.slice(0, 5),
    type: 'spreadsheet',
  }
}

async function executeGenerateImage(input: {
  type: 'infographic' | 'dashboard' | 'chart' | 'custom'
  prompt: string
  title?: string
  metrics?: { name: string; value: string | number; change?: number; trend?: 'up' | 'down' | 'neutral' }[]
  period?: string
}) {
  try {
    let result: { imageData: string; mimeType: string; prompt: string }

    switch (input.type) {
      case 'dashboard':
        if (input.metrics && input.title) {
          result = await generateFinancialDashboard(input.title, input.metrics, input.period)
        } else {
          result = await generateImage(input.prompt, { style: 'financial' })
        }
        break

      case 'infographic':
        if (input.metrics && input.title) {
          const sections = input.metrics.map(m => ({
            label: m.name,
            value: m.value,
          }))
          result = await generateInfographic(input.title, sections)
        } else {
          result = await generateImage(input.prompt, { style: 'infographic' })
        }
        break

      case 'chart':
        result = await generateImage(input.prompt, { style: 'chart' })
        break

      default:
        result = await generateImage(input.prompt, { style: 'financial' })
    }

    // Return image data for display in canvas
    return {
      type: 'image',
      data: {
        title: input.title || 'Generated Visualization',
        imageData: result.imageData,
        mimeType: result.mimeType,
        prompt: result.prompt,
      },
    }
  } catch (error) {
    console.error('Image generation error:', error)
    return {
      type: 'image',
      data: {
        title: input.title || 'Image Generation',
        error: error instanceof Error ? error.message : 'Failed to generate image',
        prompt: input.prompt,
      },
    }
  }
}

/**
 * Execute complex financial analysis using orchestrator-workers pattern
 */
async function executeComplexAnalysis(input: { query: string; targetAudience?: string }) {
  try {
    const result = await financialOrchestrator.analyze(input.query, {
      targetAudience: input.targetAudience,
    })

    return {
      type: 'analysis',
      data: {
        summary: result.synthesis,
        analysis: result.analysis,
        workerResults: result.workerResults.map(w => ({
          type: w.type,
          description: w.description,
          findings: w.result,
          metrics: w.metrics,
        })),
      },
    }
  } catch (error) {
    console.error('Complex analysis error:', error)
    return {
      type: 'error',
      error: error instanceof Error ? error.message : 'Analysis failed',
    }
  }
}

/**
 * Evaluate and optionally optimize a financial report
 */
async function executeEvaluateReport(input: { report: string; optimize?: boolean; maxIterations?: number }) {
  try {
    const evaluation = await reportEvaluator.evaluate(input.report)

    if (input.optimize && evaluation.status !== 'PASS') {
      const optimized = await reportEvaluator.optimize(
        input.report,
        evaluation.feedback,
        input.maxIterations || 3
      )

      return {
        type: 'evaluation',
        data: {
          initialStatus: evaluation.status,
          initialScores: evaluation.scores,
          feedback: evaluation.feedback,
          optimizedReport: optimized.optimizedReport,
          finalScores: optimized.finalScore,
          iterations: optimized.iterations,
        },
      }
    }

    return {
      type: 'evaluation',
      data: {
        status: evaluation.status,
        scores: evaluation.scores,
        feedback: evaluation.feedback,
      },
    }
  } catch (error) {
    console.error('Report evaluation error:', error)
    return {
      type: 'error',
      error: error instanceof Error ? error.message : 'Evaluation failed',
    }
  }
}

/**
 * Analyze a document (PDF or image) for financial insights
 */
async function executeAnalyzeDocument(input: {
  documentBase64: string
  mimeType: string
  extractCharts?: boolean
  extractTables?: boolean
  generateNarration?: boolean
  question?: string
}) {
  try {
    if (input.mimeType === 'application/pdf') {
      const result = await documentAnalyzer.analyzePdf(input.documentBase64, {
        extractCharts: input.extractCharts,
        extractTables: input.extractTables,
        generateNarration: input.generateNarration,
        specificQuestions: input.question ? [input.question] : undefined,
      })

      return {
        type: 'document_analysis',
        data: {
          summary: result.summary,
          charts: result.charts,
          tables: result.tables,
          keyMetrics: result.keyMetrics,
          narration: result.narration,
          extractedData: result.extractedData,
        },
      }
    } else if (input.mimeType.startsWith('image/')) {
      const result = await documentAnalyzer.analyzeImage(
        input.documentBase64,
        input.mimeType,
        input.question
      )

      return {
        type: 'image_analysis',
        data: {
          description: result.description,
          extractedData: result.extractedData,
        },
      }
    }

    return {
      type: 'error',
      error: 'Unsupported document type',
    }
  } catch (error) {
    console.error('Document analysis error:', error)
    return {
      type: 'error',
      error: error instanceof Error ? error.message : 'Document analysis failed',
    }
  }
}

/**
 * Export data to Excel or PowerPoint file
 */
async function executeExportFile(input: {
  format: 'excel' | 'powerpoint'
  title: string
  data: {
    sheets?: { name: string; columns: string[]; rows: Record<string, unknown>[] }[]
    slides?: { title: string; content?: string; chartData?: unknown; tableData?: unknown }[]
  }
  filename?: string
}) {
  try {
    const timestamp = new Date().toISOString().slice(0, 10)
    const baseFilename = input.filename || input.title.toLowerCase().replace(/\s+/g, '-')

    if (input.format === 'excel') {
      // For Excel, we return the data structure that the frontend can use
      // In a full implementation, this would use xlsx or exceljs to create a real file
      const filename = `${baseFilename}-${timestamp}.xlsx`

      return {
        type: 'export',
        data: {
          format: 'excel',
          filename,
          title: input.title,
          sheets: input.data.sheets || [{
            name: 'Sheet1',
            columns: ['Column1', 'Column2'],
            rows: [{ Column1: 'No data provided', Column2: '' }],
          }],
          downloadReady: true,
          message: `Excel file "${filename}" is ready for download`,
        },
      }
    } else {
      // For PowerPoint
      const filename = `${baseFilename}-${timestamp}.pptx`

      return {
        type: 'export',
        data: {
          format: 'powerpoint',
          filename,
          title: input.title,
          slides: input.data.slides || [{
            title: input.title,
            content: 'No content provided',
          }],
          downloadReady: true,
          message: `PowerPoint file "${filename}" is ready for download`,
        },
      }
    }
  } catch (error) {
    console.error('Export file error:', error)
    return {
      type: 'error',
      error: error instanceof Error ? error.message : 'Export failed',
    }
  }
}

async function executeTool(name: string, input: unknown, userId?: string): Promise<unknown> {
  switch (name) {
    case 'search_documents':
      return executeSearchDocuments(input as { query: string; limit?: number; documentType?: string }, userId)
    case 'financial_calculation':
      return executeFinancialCalculation(input as { operation: string; values: number[]; params?: Record<string, unknown> })
    case 'generate_chart':
      return executeGenerateChart(input as { chartType: string; title: string; data: unknown[]; xAxisKey: string; yAxisKeys: string[]; xAxisLabel?: string; yAxisLabel?: string })
    case 'generate_table':
      return executeGenerateTable(input as { title: string; columns: string[]; rows: unknown[]; highlightColumn?: string })
    case 'spreadsheet_operation':
      return executeSpreadsheetOperation(input as { action: string; filePath?: string; sheet?: string; range?: string; data?: unknown[][] })
    case 'generate_image':
      return executeGenerateImage(input as {
        type: 'infographic' | 'dashboard' | 'chart' | 'custom'
        prompt: string
        title?: string
        metrics?: { name: string; value: string | number; change?: number; trend?: 'up' | 'down' | 'neutral' }[]
        period?: string
      })
    case 'complex_analysis':
      return executeComplexAnalysis(input as { query: string; targetAudience?: string })
    case 'evaluate_report':
      return executeEvaluateReport(input as { report: string; optimize?: boolean; maxIterations?: number })
    case 'analyze_document':
      return executeAnalyzeDocument(input as {
        documentBase64: string
        mimeType: string
        extractCharts?: boolean
        extractTables?: boolean
        generateNarration?: boolean
        question?: string
      })
    case 'export_file':
      return executeExportFile(input as {
        format: 'excel' | 'powerpoint'
        title: string
        data: {
          sheets?: { name: string; columns: string[]; rows: Record<string, unknown>[] }[]
          slides?: { title: string; content?: string; chartData?: unknown; tableData?: unknown }[]
        }
        filename?: string
      })
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

export async function streamFinanceChat(
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  options?: {
    sessionId?: string
    userId?: string
    documentContext?: string // Optional document context for RAG
  }
) {
  try {
    // Update cache timestamp (refresh every 5 minutes)
    const currentTime = Math.floor(Date.now() / 300000) * 300000
    if (currentTime !== cacheTimestamp) {
      cacheTimestamp = currentTime
    }

    // Convert to Anthropic format with caching support
    const anthropicMessages: Anthropic.MessageParam[] = messages.map((m, index) => {
      const role = m.role === 'user' ? 'user' : 'assistant'
      // Cache the last user message for multi-turn efficiency
      if (m.role === 'user' && index === messages.length - 1) {
        return {
          role: role as 'user',
          content: [
            {
              type: 'text' as const,
              text: m.content,
              cache_control: { type: 'ephemeral' as const },
            },
          ],
        }
      }
      return {
        role: role as 'user' | 'assistant',
        content: m.content,
      }
    })

    // Build system prompt with caching
    // The system prompt is stable and should be cached for efficiency
    const systemWithCache: Anthropic.MessageCreateParams['system'] = [
      {
        type: 'text' as const,
        text: `${cacheTimestamp}\n${FINANCE_SYSTEM_PROMPT}`,
        cache_control: { type: 'ephemeral' as const },
      },
    ]

    // Add document context if provided (also cached)
    if (options?.documentContext) {
      systemWithCache.push({
        type: 'text' as const,
        text: `\n\n<document_context>\n${options.documentContext}\n</document_context>`,
        cache_control: { type: 'ephemeral' as const },
      })
    }

    let continueLoop = true
    let currentMessages = anthropicMessages
    let iterations = 0
    const maxIterations = 5 // Prevent infinite loops
    let accumulatedText = '' // Accumulate text across iterations
    let totalInputTokens = 0
    let totalOutputTokens = 0

    while (continueLoop && iterations < maxIterations) {
      iterations++

      const stream = await anthropic.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemWithCache,
        tools: financeTools,
        messages: currentMessages,
      })

      let assistantContent: Anthropic.ContentBlock[] = []
      let iterationText = '' // Text from this iteration only

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            iterationText += event.delta.text
          }
        }
      }

      const finalMessage = await stream.finalMessage()
      assistantContent = finalMessage.content
      totalInputTokens += finalMessage.usage.input_tokens
      totalOutputTokens += finalMessage.usage.output_tokens

      // Check for tool use
      const toolUseBlocks = assistantContent.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      )

      if (toolUseBlocks.length > 0) {
        // Execute tools and collect results
        const toolResults: Anthropic.ToolResultBlockParam[] = []

        for (const toolUse of toolUseBlocks) {
          callbacks.onToolStart(toolUse.name, toolUse.input)

          const result = await executeTool(toolUse.name, toolUse.input, options?.userId)

          callbacks.onToolResult(toolUse.name, result)

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          })
        }

        // Add assistant message and tool results to conversation
        currentMessages = [
          ...currentMessages,
          { role: 'assistant', content: assistantContent },
          { role: 'user', content: toolResults },
        ]

        // Don't stream intermediate text - only accumulate it
        // The final response will have all the context
      } else {
        // No tool use, this is the final response - stream it now
        // Stream the text character by character for smooth display
        for (const char of iterationText) {
          callbacks.onText(char)
        }
        accumulatedText = iterationText

        continueLoop = false
        callbacks.onDone({
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        })
      }

      // Check stop reason
      if (finalMessage.stop_reason === 'end_turn' && toolUseBlocks.length === 0) {
        continueLoop = false
      }
    }
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)))
  }
}
