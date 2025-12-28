import { GoogleGenerativeAI } from '@google/generative-ai'
import { createServiceClient } from '@/lib/supabase/server'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// Use Gemini for synthesis
const GEMINI_MODEL = 'gemini-2.0-flash'

export interface SynthesisResult {
  success: boolean
  synthesis_text: string
  synthesis_summary: string
  document_count: number
  metrics_count: number
  rules_count: number
  error?: string
}

interface DocumentWithMetadata {
  id: string
  name: string
  finance_metadata: Record<string, unknown> | null
  updated_at: string
}

interface AggregatedKnowledge {
  entities: {
    companies: Array<{ name: string; type: string; source: string }>
    accounts: Array<{ code: string; name: string; category: string; source: string }>
  }
  metrics: Array<{
    name: string
    value: number | string
    unit: string
    period: string
    category: string
    source_document: string
  }>
  rules: Array<{
    type: string
    description: string
    condition: string
    action: string
    source_document: string
  }>
  relationships: Array<{
    from: string
    to: string
    type: string
    description: string
  }>
  tables: Array<{
    name: string
    headers: string[]
    sample_data: string[][]
    source_document: string
  }>
  content_summaries: Array<{
    document: string
    type: string
    summary: string
  }>
}

/**
 * Synthesize knowledge base from all enabled documents for a user
 * This should be called after:
 * - Document upload completes
 * - Document toggle changes (is_enabled)
 * - Document deletion
 */
export async function synthesizeKnowledgeBase(userId: string): Promise<SynthesisResult> {
  const supabase = await createServiceClient()

  try {
    // 1. Get or create knowledge base and mark as processing
    await (supabase.rpc as any)('get_or_create_knowledge_base', { p_user_id: userId })
    await supabase
      .from('knowledge_bases' as any)
      .update({
        synthesis_status: 'processing',
        synthesis_error: null
      })
      .eq('user_id', userId)

    // 2. Get all enabled documents with their finance_metadata
    const { data: documents, error: docError } = await supabase
      .from('documents')
      .select('id, name, finance_metadata, updated_at')
      .eq('user_id', userId)
      .eq('is_enabled', true)
      .eq('status', 'completed')
      .order('updated_at', { ascending: false })

    if (docError) {
      throw new Error(`Failed to fetch documents: ${docError.message}`)
    }

    // 3. Handle case with no enabled documents
    if (!documents || documents.length === 0) {
      await supabase
        .from('knowledge_bases' as any)
        .update({
          financial_entities: {},
          metrics: [],
          business_rules: [],
          relationships: [],
          synthesis_text: null,
          synthesis_summary: 'No documents currently enabled in knowledge base.',
          source_documents: [],
          document_count: 0,
          synthesis_status: 'completed',
          last_synthesized_at: new Date().toISOString(),
        })
        .eq('user_id', userId)

      return {
        success: true,
        synthesis_text: '',
        synthesis_summary: 'No documents currently enabled.',
        document_count: 0,
        metrics_count: 0,
        rules_count: 0,
      }
    }

    // 4. Aggregate all finance_metadata
    const aggregatedKnowledge = aggregateFinanceMetadata(documents as DocumentWithMetadata[])

    // 5. Use Gemini to synthesize a coherent knowledge summary
    const synthesisResult = await generateKnowledgeSynthesis(aggregatedKnowledge, documents as DocumentWithMetadata[])

    // 6. Update knowledge base with synthesized data
    await supabase
      .from('knowledge_bases' as any)
      .update({
        financial_entities: aggregatedKnowledge.entities,
        metrics: aggregatedKnowledge.metrics,
        business_rules: aggregatedKnowledge.rules,
        relationships: aggregatedKnowledge.relationships,
        synthesis_text: synthesisResult.full_text,
        synthesis_summary: synthesisResult.summary,
        source_documents: documents.map(d => ({
          document_id: d.id,
          name: d.name,
          last_processed: d.updated_at,
        })),
        document_count: documents.length,
        synthesis_status: 'completed',
        synthesis_error: null,
        last_synthesized_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    console.log(`Knowledge base synthesized for user ${userId}: ${documents.length} documents, ${aggregatedKnowledge.metrics.length} metrics`)

    return {
      success: true,
      synthesis_text: synthesisResult.full_text,
      synthesis_summary: synthesisResult.summary,
      document_count: documents.length,
      metrics_count: aggregatedKnowledge.metrics.length,
      rules_count: aggregatedKnowledge.rules.length,
    }

  } catch (error) {
    console.error(`Knowledge synthesis failed for user ${userId}:`, error)

    // Mark as failed but don't throw - chat should still work
    await supabase
      .from('knowledge_bases' as any)
      .update({
        synthesis_status: 'failed',
        synthesis_error: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('user_id', userId)

    return {
      success: false,
      synthesis_text: '',
      synthesis_summary: '',
      document_count: 0,
      metrics_count: 0,
      rules_count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Aggregate finance_metadata from all documents into unified structure
 */
function aggregateFinanceMetadata(documents: DocumentWithMetadata[]): AggregatedKnowledge {
  const knowledge: AggregatedKnowledge = {
    entities: {
      companies: [],
      accounts: [],
    },
    metrics: [],
    rules: [],
    relationships: [],
    tables: [],
    content_summaries: [],
  }

  for (const doc of documents) {
    if (!doc.finance_metadata) continue

    const metadata = doc.finance_metadata as Record<string, unknown>

    // Extract document type and content summary
    if (metadata.documentType || metadata.content) {
      knowledge.content_summaries.push({
        document: doc.name,
        type: (metadata.documentType as string) || 'unknown',
        summary: truncateContent((metadata.content as string) || '', 500),
      })
    }

    // Extract key metrics
    if (metadata.keyMetrics && typeof metadata.keyMetrics === 'object') {
      const metrics = metadata.keyMetrics as Record<string, unknown>
      for (const [name, value] of Object.entries(metrics)) {
        if (value !== null && value !== undefined) {
          knowledge.metrics.push({
            name,
            value: value as number | string,
            unit: inferUnit(name, value),
            period: (metadata.period as string) || 'Unknown',
            category: inferCategory(name),
            source_document: doc.name,
          })
        }
      }
    }

    // Extract tables (sample data only)
    if (metadata.tables && Array.isArray(metadata.tables)) {
      for (const table of metadata.tables as Array<{ name?: string; headers?: string[]; rows?: string[][] }>) {
        if (table.headers && table.rows) {
          knowledge.tables.push({
            name: table.name || 'Unnamed Table',
            headers: table.headers,
            sample_data: table.rows.slice(0, 3), // First 3 rows only
            source_document: doc.name,
          })
        }
      }
    }

    // Extract business rules from policy documents
    if (metadata.documentType === 'policy' || metadata.documentType === 'budget') {
      const content = (metadata.content as string) || ''
      const rules = extractBusinessRules(content, doc.name)
      knowledge.rules.push(...rules)
    }
  }

  // Deduplicate metrics by name+period (keep latest)
  knowledge.metrics = deduplicateMetrics(knowledge.metrics)

  return knowledge
}

/**
 * Use Gemini to synthesize a coherent knowledge summary
 */
async function generateKnowledgeSynthesis(
  knowledge: AggregatedKnowledge,
  documents: DocumentWithMetadata[]
): Promise<{ summary: string; full_text: string }> {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })

  const prompt = `You are a financial analyst synthesizing knowledge from ${documents.length} documents into a structured knowledge base.

## 📁 Source Documents
${documents.map(d => `• ${d.name}`).join('\n')}

## 📊 Extracted Metrics
${JSON.stringify(knowledge.metrics.slice(0, 50), null, 2)}

## 📄 Document Summaries
${knowledge.content_summaries.map(s => `### ${s.document} (${s.type})\n${s.summary}`).join('\n\n')}

## 📋 Business Rules & Policies
${JSON.stringify(knowledge.rules.slice(0, 20), null, 2)}

## Your Task
Create a beautifully formatted knowledge base that an AI finance assistant will use. Structure it as follows:

### Output Requirements:
1. **Executive Summary** - 2-3 impactful sentences highlighting key financial status
2. **Key Metrics Section** - Organized table-like format with metric name, value, period, and trend
3. **Business Rules** - Clear bullet points of policies and thresholds
4. **Document Insights** - Brief highlights from each document type
5. **Use markdown formatting** - Headers (##), bold (**), bullet points (•), and dividers (---)

### Formatting Guidelines:
- Use emoji sparingly for visual hierarchy (📊 📈 💰 📋)
- Format numbers with proper separators (e.g., $1,234,567)
- Include percentage changes with ↑ or ↓ arrows
- Keep each section concise but informative
- Maximum 5000 characters for full_text

Format your response as JSON:
{
  "summary": "2-3 sentence executive summary with key highlights",
  "full_text": "Beautifully formatted markdown knowledge base"
}

IMPORTANT: Respond ONLY with valid JSON, no markdown code blocks around the JSON.`

  try {
    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    // Try to parse JSON, handle potential formatting issues
    let parsed: { summary: string; full_text: string }
    try {
      // Remove potential markdown code blocks
      const cleanedText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
      parsed = JSON.parse(cleanedText)
    } catch {
      // If JSON parsing fails, create structured response from text
      parsed = {
        summary: 'Financial knowledge base synthesized from uploaded documents.',
        full_text: responseText.slice(0, 5000),
      }
    }

    // Ensure we don't exceed reasonable limits
    return {
      summary: parsed.summary?.slice(0, 500) || 'Knowledge base synthesized.',
      full_text: parsed.full_text?.slice(0, 50000) || '', // Max 50k chars for system prompt
    }
  } catch (error) {
    console.error('Gemini synthesis failed:', error)

    // Fallback: create basic synthesis from extracted data
    return createFallbackSynthesis(knowledge, documents)
  }
}

/**
 * Create fallback synthesis without Gemini
 */
function createFallbackSynthesis(
  knowledge: AggregatedKnowledge,
  documents: DocumentWithMetadata[]
): { summary: string; full_text: string } {
  const summary = `📊 Knowledge base contains ${documents.length} documents with ${knowledge.metrics.length} financial metrics and ${knowledge.rules.length} business rules.`

  let fullText = `## 📚 Financial Knowledge Base\n\n`
  fullText += `---\n\n`
  fullText += `### 📁 Source Documents (${documents.length})\n`
  fullText += documents.map(d => `• ${d.name}`).join('\n')
  fullText += '\n\n---\n\n'

  if (knowledge.metrics.length > 0) {
    fullText += `### 📊 Key Financial Metrics\n\n`
    fullText += `| Metric | Value | Period | Source |\n`
    fullText += `|--------|-------|--------|--------|\n`
    for (const metric of knowledge.metrics.slice(0, 20)) {
      const formattedValue = typeof metric.value === 'number'
        ? metric.unit === 'USD'
          ? `$${metric.value.toLocaleString()}`
          : metric.unit === '%'
            ? `${metric.value}%`
            : `${metric.value.toLocaleString()} ${metric.unit}`
        : `${metric.value} ${metric.unit}`
      fullText += `| **${metric.name}** | ${formattedValue} | ${metric.period} | ${metric.source_document} |\n`
    }
    fullText += '\n---\n\n'
  }

  if (knowledge.rules.length > 0) {
    fullText += `### 📋 Business Rules & Policies\n\n`
    for (const rule of knowledge.rules.slice(0, 15)) {
      fullText += `• **${rule.type}**: ${rule.description}\n`
    }
    fullText += '\n---\n\n'
  }

  if (knowledge.content_summaries.length > 0) {
    fullText += `### 📄 Document Insights\n\n`
    for (const docSummary of knowledge.content_summaries.slice(0, 10)) {
      fullText += `#### ${docSummary.document}\n`
      fullText += `*Type: ${docSummary.type}*\n\n`
      fullText += `${docSummary.summary}\n\n`
    }
  }

  return { summary, full_text: fullText.slice(0, 50000) }
}

// ============================================
// Helper Functions
// ============================================

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content
  return content.slice(0, maxLength) + '...'
}

function inferUnit(metricName: string, value: unknown): string {
  const name = metricName.toLowerCase()

  if (name.includes('margin') || name.includes('rate') || name.includes('percentage') || name.includes('growth')) {
    return '%'
  }
  if (name.includes('revenue') || name.includes('cost') || name.includes('income') || name.includes('expense') ||
      name.includes('profit') || name.includes('ebitda') || name.includes('budget')) {
    return 'USD'
  }
  if (name.includes('days') || name.includes('cycle')) {
    return 'days'
  }
  if (name.includes('count') || name.includes('headcount') || name.includes('employees')) {
    return 'count'
  }

  // Check if value looks like a percentage
  if (typeof value === 'string' && value.includes('%')) {
    return '%'
  }

  return ''
}

function inferCategory(metricName: string): string {
  const name = metricName.toLowerCase()

  if (name.includes('revenue') || name.includes('sales')) return 'revenue'
  if (name.includes('cost') || name.includes('expense')) return 'expense'
  if (name.includes('margin') || name.includes('profit') || name.includes('ebitda')) return 'profitability'
  if (name.includes('ratio') || name.includes('liquidity') || name.includes('current')) return 'liquidity'
  if (name.includes('growth') || name.includes('yoy') || name.includes('qoq')) return 'growth'

  return 'other'
}

function extractBusinessRules(content: string, sourceName: string): AggregatedKnowledge['rules'] {
  const rules: AggregatedKnowledge['rules'] = []

  // Simple pattern matching for common business rules
  const patterns = [
    // Approval thresholds
    /(?:over|above|exceeding?)\s*\$?([\d,]+)\s*(?:require|need)s?\s+(.+?)(?:approval|review)/gi,
    // Budget rules
    /budget[s]?\s+(?:must|should|cannot)\s+(.+?)(?:\.|$)/gi,
    // Percentage limits
    /(?:cap(?:ped)?|limit(?:ed)?|maximum)\s+(?:at|of|to)\s+([\d.]+%?)/gi,
  ]

  for (const pattern of patterns) {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      rules.push({
        type: 'policy',
        description: match[0].trim(),
        condition: match[1] || '',
        action: match[2] || '',
        source_document: sourceName,
      })
    }
  }

  return rules.slice(0, 10) // Limit to 10 rules per document
}

function deduplicateMetrics(metrics: AggregatedKnowledge['metrics']): AggregatedKnowledge['metrics'] {
  const seen = new Map<string, AggregatedKnowledge['metrics'][0]>()

  for (const metric of metrics) {
    const key = `${metric.name.toLowerCase()}-${metric.period}`
    // Keep the first occurrence (most recent due to ordering)
    if (!seen.has(key)) {
      seen.set(key, metric)
    }
  }

  return Array.from(seen.values())
}

/**
 * Get user's knowledge base for agent context
 */
export async function getKnowledgeBaseForUser(userId: string): Promise<{
  synthesis_text: string | null
  synthesis_summary: string | null
  document_count: number
  last_synthesized_at: string | null
} | null> {
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('knowledge_bases' as any)
    .select('synthesis_text, synthesis_summary, document_count, last_synthesized_at')
    .eq('user_id', userId)
    .eq('synthesis_status', 'completed')
    .single()

  if (error || !data) {
    return null
  }

  return data as unknown as {
    synthesis_text: string | null
    synthesis_summary: string | null
    document_count: number
    last_synthesized_at: string | null
  }
}
