import Anthropic from '@anthropic-ai/sdk'

/**
 * Orchestrator-Workers Pattern Implementation
 * Based on: https://github.com/anthropics/claude-cookbooks/blob/main/patterns/agents/orchestrator_workers.ipynb
 *
 * This pattern breaks complex financial analysis tasks into subtasks
 * that can be processed by specialized workers.
 */

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// Task types for financial analysis
export type FinancialTaskType =
  | 'variance_analysis'
  | 'trend_analysis'
  | 'ratio_analysis'
  | 'comparison'
  | 'forecast'
  | 'risk_assessment'
  | 'executive_summary'

export interface SubTask {
  type: FinancialTaskType
  description: string
  priority: number
}

export interface WorkerResult {
  type: FinancialTaskType
  description: string
  result: string
  metrics?: Record<string, unknown>
}

export interface OrchestratorResult {
  analysis: string
  workerResults: WorkerResult[]
  synthesis: string
}

// Orchestrator prompt for financial analysis
const ORCHESTRATOR_PROMPT = `You are a financial analysis orchestrator. Your role is to analyze complex financial tasks and break them down into specialized subtasks.

For each task, identify 2-4 distinct analysis approaches that would provide comprehensive insights.

Available analysis types:
- variance_analysis: Analyze differences between budget/actual, periods, or segments
- trend_analysis: Identify patterns and trends over time
- ratio_analysis: Calculate and interpret financial ratios
- comparison: Compare metrics across entities, periods, or benchmarks
- forecast: Project future values based on historical data
- risk_assessment: Identify and quantify financial risks
- executive_summary: Create high-level summary for stakeholders

Return your response in this exact XML format:

<analysis>
Explain your understanding of the task and which analysis approaches would be most valuable.
Consider the stakeholder needs and what insights would drive decisions.
</analysis>

<tasks>
  <task>
    <type>[analysis_type]</type>
    <priority>[1-4, where 1 is highest]</priority>
    <description>Specific instructions for this analysis, including what metrics to focus on</description>
  </task>
</tasks>`

// Worker prompt template
const WORKER_PROMPT = `You are a specialized financial analyst. Generate a detailed analysis based on:

Original Request: {original_task}
Analysis Type: {task_type}
Specific Instructions: {task_description}

{context}

Provide your analysis in this format:

<analysis>
Your detailed financial analysis here. Include:
- Key findings
- Specific numbers and calculations
- Supporting evidence
- Implications for decision-making
</analysis>

<metrics>
Key metrics in JSON format (if applicable):
{
  "metric_name": value,
  ...
}
</metrics>

<recommendation>
Actionable recommendations based on your analysis
</recommendation>`

// Synthesis prompt for combining worker results
const SYNTHESIS_PROMPT = `You are a senior financial analyst. Synthesize the following analysis results into a cohesive executive summary.

Original Task: {original_task}

Analysis Results:
{worker_results}

Create a synthesis that:
1. Highlights the most critical findings across all analyses
2. Identifies common themes and patterns
3. Resolves any conflicting insights
4. Provides prioritized recommendations
5. Suggests next steps

Format your response as:

<executive_summary>
Your synthesized summary here
</executive_summary>

<key_insights>
- Bullet points of the most important insights
</key_insights>

<recommendations>
Prioritized list of recommendations with expected impact
</recommendations>`

/**
 * Parse XML tasks from orchestrator response
 */
function parseTasksXml(xmlContent: string): SubTask[] {
  const tasks: SubTask[] = []
  const taskRegex = /<task>([\s\S]*?)<\/task>/g
  let match

  while ((match = taskRegex.exec(xmlContent)) !== null) {
    const taskContent = match[1]

    const typeMatch = taskContent.match(/<type>(.*?)<\/type>/)
    const priorityMatch = taskContent.match(/<priority>(.*?)<\/priority>/)
    const descMatch = taskContent.match(/<description>([\s\S]*?)<\/description>/)

    if (typeMatch && descMatch) {
      tasks.push({
        type: typeMatch[1].trim() as FinancialTaskType,
        priority: priorityMatch ? parseInt(priorityMatch[1].trim()) : 1,
        description: descMatch[1].trim(),
      })
    }
  }

  // Sort by priority
  return tasks.sort((a, b) => a.priority - b.priority)
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
 * Make an LLM call
 */
async function llmCall(
  prompt: string,
  model: string = 'claude-sonnet-4-20250514'
): Promise<string> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = response.content.find((block) => block.type === 'text')
  return textBlock?.type === 'text' ? textBlock.text : ''
}

/**
 * Financial Analysis Orchestrator
 * Breaks down complex financial analysis into specialized subtasks
 */
export class FinancialOrchestrator {
  private model: string

  constructor(model: string = 'claude-sonnet-4-20250514') {
    this.model = model
  }

  /**
   * Process a financial analysis task using orchestrator-workers pattern
   */
  async analyze(
    task: string,
    context?: {
      documentContent?: string
      historicalData?: Record<string, unknown>[]
      targetAudience?: string
    }
  ): Promise<OrchestratorResult> {
    // Step 1: Orchestrator analyzes task and creates subtasks
    const orchestratorInput = `${ORCHESTRATOR_PROMPT}\n\nTask: ${task}${
      context?.targetAudience ? `\nTarget Audience: ${context.targetAudience}` : ''
    }`

    const orchestratorResponse = await llmCall(orchestratorInput, this.model)

    const analysis = extractXml(orchestratorResponse, 'analysis')
    const tasksXml = extractXml(orchestratorResponse, 'tasks')
    const subtasks = parseTasksXml(`<tasks>${tasksXml}</tasks>`)

    console.log(`[Orchestrator] Identified ${subtasks.length} analysis approaches`)

    // Step 2: Execute workers for each subtask
    const workerResults: WorkerResult[] = []

    for (const subtask of subtasks) {
      console.log(`[Worker] Processing: ${subtask.type}`)

      // Build context string
      let contextStr = ''
      if (context?.documentContent) {
        contextStr += `\n<document_context>\n${context.documentContent}\n</document_context>`
      }
      if (context?.historicalData) {
        contextStr += `\n<historical_data>\n${JSON.stringify(context.historicalData, null, 2)}\n</historical_data>`
      }

      const workerInput = WORKER_PROMPT
        .replace('{original_task}', task)
        .replace('{task_type}', subtask.type)
        .replace('{task_description}', subtask.description)
        .replace('{context}', contextStr)

      const workerResponse = await llmCall(workerInput, this.model)

      const analysisContent = extractXml(workerResponse, 'analysis')
      const metricsJson = extractXml(workerResponse, 'metrics')
      const recommendation = extractXml(workerResponse, 'recommendation')

      let metrics: Record<string, unknown> | undefined
      try {
        if (metricsJson) {
          // Extract JSON from the metrics content
          const jsonMatch = metricsJson.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            metrics = JSON.parse(jsonMatch[0])
          }
        }
      } catch {
        // Metrics parsing failed, continue without metrics
      }

      workerResults.push({
        type: subtask.type,
        description: subtask.description,
        result: `${analysisContent}\n\nRecommendation: ${recommendation}`,
        metrics,
      })
    }

    // Step 3: Synthesize results
    const workerResultsFormatted = workerResults
      .map(
        (r, i) =>
          `\n--- Analysis ${i + 1}: ${r.type.toUpperCase()} ---\n${r.result}${
            r.metrics ? `\nMetrics: ${JSON.stringify(r.metrics)}` : ''
          }`
      )
      .join('\n')

    const synthesisInput = SYNTHESIS_PROMPT
      .replace('{original_task}', task)
      .replace('{worker_results}', workerResultsFormatted)

    const synthesisResponse = await llmCall(synthesisInput, this.model)

    const executiveSummary = extractXml(synthesisResponse, 'executive_summary')
    const keyInsights = extractXml(synthesisResponse, 'key_insights')
    const recommendations = extractXml(synthesisResponse, 'recommendations')

    const synthesis = `${executiveSummary}\n\nKey Insights:\n${keyInsights}\n\nRecommendations:\n${recommendations}`

    return {
      analysis,
      workerResults,
      synthesis,
    }
  }
}

/**
 * Evaluator-Optimizer Pattern for Report Quality
 * Based on: https://github.com/anthropics/claude-cookbooks/blob/main/patterns/agents/evaluator_optimizer.ipynb
 */
export class ReportEvaluator {
  private model: string

  constructor(model: string = 'claude-sonnet-4-20250514') {
    this.model = model
  }

  /**
   * Evaluate a financial report for quality and completeness
   */
  async evaluate(
    report: string,
    criteria: {
      accuracy?: boolean
      completeness?: boolean
      clarity?: boolean
      actionability?: boolean
    } = {}
  ): Promise<{
    status: 'PASS' | 'NEEDS_IMPROVEMENT' | 'FAIL'
    feedback: string
    scores: Record<string, number>
  }> {
    const criteriaList = [
      criteria.accuracy !== false && 'Accuracy: Are numbers and calculations correct?',
      criteria.completeness !== false && 'Completeness: Does it cover all relevant aspects?',
      criteria.clarity !== false && 'Clarity: Is it easy to understand for the target audience?',
      criteria.actionability !== false && 'Actionability: Does it provide clear recommendations?',
    ].filter(Boolean)

    const evaluationPrompt = `Evaluate this financial report:

<report>
${report}
</report>

Evaluation Criteria:
${criteriaList.map((c, i) => `${i + 1}. ${c}`).join('\n')}

For each criterion, provide a score from 1-10 and specific feedback.

Output format:
<scores>
{
  "accuracy": [score],
  "completeness": [score],
  "clarity": [score],
  "actionability": [score]
}
</scores>

<evaluation>
PASS, NEEDS_IMPROVEMENT, or FAIL
(PASS requires all scores >= 7, FAIL if any score <= 3)
</evaluation>

<feedback>
Specific feedback for improvement, organized by criterion
</feedback>`

    const response = await llmCall(evaluationPrompt, this.model)

    const scoresJson = extractXml(response, 'scores')
    const evaluation = extractXml(response, 'evaluation').trim()
    const feedback = extractXml(response, 'feedback')

    let scores: Record<string, number> = {}
    try {
      scores = JSON.parse(scoresJson)
    } catch {
      scores = { overall: 5 }
    }

    return {
      status: evaluation as 'PASS' | 'NEEDS_IMPROVEMENT' | 'FAIL',
      feedback,
      scores,
    }
  }

  /**
   * Optimize a report based on evaluation feedback
   */
  async optimize(
    report: string,
    feedback: string,
    maxIterations: number = 3
  ): Promise<{
    optimizedReport: string
    iterations: number
    finalScore: Record<string, number>
  }> {
    let currentReport = report
    let iterations = 0

    while (iterations < maxIterations) {
      iterations++

      const evaluation = await this.evaluate(currentReport)

      if (evaluation.status === 'PASS') {
        return {
          optimizedReport: currentReport,
          iterations,
          finalScore: evaluation.scores,
        }
      }

      // Generate improved version
      const optimizePrompt = `Improve this financial report based on the feedback:

<report>
${currentReport}
</report>

<feedback>
${evaluation.feedback}
</feedback>

Generate an improved version that addresses all feedback points.
Maintain the same structure but enhance quality.

<improved_report>
Your improved report here
</improved_report>`

      const response = await llmCall(optimizePrompt, this.model)
      currentReport = extractXml(response, 'improved_report') || currentReport
    }

    // Final evaluation
    const finalEval = await this.evaluate(currentReport)

    return {
      optimizedReport: currentReport,
      iterations,
      finalScore: finalEval.scores,
    }
  }
}

// Export singleton instances
export const financialOrchestrator = new FinancialOrchestrator()
export const reportEvaluator = new ReportEvaluator()
