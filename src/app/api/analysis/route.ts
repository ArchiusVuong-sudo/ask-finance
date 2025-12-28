import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { financialOrchestrator, reportEvaluator } from '@/lib/agents/orchestrator'
import { documentAnalyzer } from '@/lib/agents/document-analyzer'
import { getStructuredFinancialAnswer, extractFinancialMetrics } from '@/lib/agents/json-mode'

export const runtime = 'nodejs'
export const maxDuration = 120 // Allow longer for complex analysis

/**
 * Complex Financial Analysis API
 * Uses Claude Cookbook patterns:
 * - Orchestrator-Workers for multi-faceted analysis
 * - Evaluator-Optimizer for quality reports
 * - Document Analyzer for PDF processing
 * - JSON Mode for structured outputs
 */

interface AnalysisRequest {
  type: 'orchestrated' | 'evaluate' | 'document' | 'structured'
  query?: string
  report?: string
  documentBase64?: string
  documentMimeType?: string
  options?: {
    targetAudience?: string
    evaluationCriteria?: {
      accuracy?: boolean
      completeness?: boolean
      clarity?: boolean
      actionability?: boolean
    }
    extractCharts?: boolean
    extractTables?: boolean
    generateNarration?: boolean
    maxIterations?: number
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body: AnalysisRequest = await request.json()

    // Route to appropriate analysis pattern
    switch (body.type) {
      // Orchestrator-Workers Pattern
      case 'orchestrated': {
        if (!body.query) {
          return NextResponse.json(
            { error: 'Query is required for orchestrated analysis' },
            { status: 400 }
          )
        }

        const result = await financialOrchestrator.analyze(body.query, {
          targetAudience: body.options?.targetAudience,
        })

        // Log usage
        await supabase.from('usage_logs').insert({
          user_id: user.id,
          action: 'orchestrated_analysis',
          details: {
            query: body.query,
            workerCount: result.workerResults.length,
            taskTypes: result.workerResults.map(w => w.type),
          },
        })

        return NextResponse.json({
          success: true,
          analysis: result.analysis,
          workerResults: result.workerResults,
          synthesis: result.synthesis,
        })
      }

      // Evaluator-Optimizer Pattern
      case 'evaluate': {
        if (!body.report) {
          return NextResponse.json(
            { error: 'Report is required for evaluation' },
            { status: 400 }
          )
        }

        const criteria = body.options?.evaluationCriteria || {}
        const evaluation = await reportEvaluator.evaluate(body.report, criteria)

        // If report needs improvement and maxIterations is set, optimize it
        if (evaluation.status !== 'PASS' && body.options?.maxIterations) {
          const optimized = await reportEvaluator.optimize(
            body.report,
            evaluation.feedback,
            body.options.maxIterations
          )

          // Log usage
          await supabase.from('usage_logs').insert({
            user_id: user.id,
            action: 'report_optimization',
            details: {
              initialStatus: evaluation.status,
              iterations: optimized.iterations,
              finalScores: optimized.finalScore,
            },
          })

          return NextResponse.json({
            success: true,
            initialEvaluation: evaluation,
            optimizedReport: optimized.optimizedReport,
            iterations: optimized.iterations,
            finalScore: optimized.finalScore,
          })
        }

        // Log usage
        await supabase.from('usage_logs').insert({
          user_id: user.id,
          action: 'report_evaluation',
          details: {
            status: evaluation.status,
            scores: evaluation.scores,
          },
        })

        return NextResponse.json({
          success: true,
          evaluation,
        })
      }

      // Document Analysis Pattern (PDF/Chart Reading)
      case 'document': {
        if (!body.documentBase64) {
          return NextResponse.json(
            { error: 'Document data is required' },
            { status: 400 }
          )
        }

        const mimeType = body.documentMimeType || 'application/pdf'

        if (mimeType === 'application/pdf') {
          const result = await documentAnalyzer.analyzePdf(body.documentBase64, {
            extractCharts: body.options?.extractCharts,
            extractTables: body.options?.extractTables,
            generateNarration: body.options?.generateNarration,
            specificQuestions: body.query ? [body.query] : undefined,
          })

          // Log usage
          await supabase.from('usage_logs').insert({
            user_id: user.id,
            action: 'document_analysis',
            details: {
              mimeType,
              chartCount: result.charts?.length || 0,
              tableCount: result.tables?.length || 0,
              metricCount: result.keyMetrics?.length || 0,
            },
          })

          return NextResponse.json({
            success: true,
            ...result,
          })
        } else if (mimeType.startsWith('image/')) {
          const result = await documentAnalyzer.analyzeImage(
            body.documentBase64,
            mimeType,
            body.query
          )

          // Log usage
          await supabase.from('usage_logs').insert({
            user_id: user.id,
            action: 'image_analysis',
            details: {
              mimeType,
              hasExtractedData: !!result.extractedData,
            },
          })

          return NextResponse.json({
            success: true,
            ...result,
          })
        }

        return NextResponse.json(
          { error: 'Unsupported document type' },
          { status: 400 }
        )
      }

      // Structured JSON Output Pattern
      case 'structured': {
        if (!body.query) {
          return NextResponse.json(
            { error: 'Query is required for structured analysis' },
            { status: 400 }
          )
        }

        const result = await getStructuredFinancialAnswer(body.query)

        // Log usage
        await supabase.from('usage_logs').insert({
          user_id: user.id,
          action: 'structured_query',
          details: {
            query: body.query,
            confidence: result.confidence,
            hasCalculations: !!result.calculations?.length,
            hasVisualizations: !!result.visualizations?.length,
          },
        })

        return NextResponse.json({
          success: true,
          ...result,
        })
      }

      default:
        return NextResponse.json(
          { error: 'Invalid analysis type' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Analysis API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    )
  }
}

/**
 * GET: Extract metrics from text (simple utility endpoint)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const text = searchParams.get('text')
    const focus = searchParams.get('focus')

    if (!text) {
      return NextResponse.json(
        { error: 'Text parameter is required' },
        { status: 400 }
      )
    }

    const metrics = await extractFinancialMetrics(text, focus || undefined)

    return NextResponse.json({
      success: true,
      metrics,
    })
  } catch (error) {
    console.error('Metrics extraction error:', error)
    return NextResponse.json(
      { error: 'Failed to extract metrics' },
      { status: 500 }
    )
  }
}
