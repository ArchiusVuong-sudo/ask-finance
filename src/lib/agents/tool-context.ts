/**
 * Tool Context Accumulator
 *
 * Accumulates context from tool executions during a conversation turn
 * to provide rich context for image generation.
 */

export interface DataPoint {
  label: string
  value: string | number
  unit?: string
}

export interface ChartConfig {
  type: string
  title: string
  dataDescription: string
}

export interface TableData {
  title: string
  columns: string[]
  rowCount: number
  summary: string
}

export interface ToolContext {
  toolName: string
  timestamp: number
  summary: string
  dataPoints?: DataPoint[]
  chartConfig?: ChartConfig
  tableData?: TableData
  rawResult?: unknown
}

/**
 * Accumulates tool execution results for use in image generation context
 */
export class ToolContextAccumulator {
  private contexts: ToolContext[] = []
  private maxContexts: number = 10

  /**
   * Add a tool result to the accumulator
   */
  add(toolName: string, result: unknown): void {
    const context = this.parseToolResult(toolName, result)
    if (context) {
      this.contexts.push(context)
      // Keep only the most recent contexts
      if (this.contexts.length > this.maxContexts) {
        this.contexts = this.contexts.slice(-this.maxContexts)
      }
    }
  }

  /**
   * Parse a tool result into structured context
   */
  private parseToolResult(toolName: string, result: unknown): ToolContext | null {
    if (!result || typeof result !== 'object') {
      return null
    }

    const resultObj = result as Record<string, unknown>
    const context: ToolContext = {
      toolName,
      timestamp: Date.now(),
      summary: '',
      rawResult: result,
    }

    // Handle chart results
    if (resultObj.type === 'chart') {
      const chartData = resultObj.data as Record<string, unknown> | undefined
      context.chartConfig = {
        type: chartData?.chartType as string || 'unknown',
        title: chartData?.title as string || 'Chart',
        dataDescription: this.describeChartData(chartData),
      }
      context.summary = `Generated ${context.chartConfig.type} chart: "${context.chartConfig.title}"`
      context.dataPoints = this.extractChartDataPoints(chartData)
      return context
    }

    // Handle table results
    if (resultObj.type === 'table') {
      const tableData = resultObj.data as Record<string, unknown> | undefined
      const rows = tableData?.rows as unknown[] || tableData?.data as unknown[] || []
      const columns = tableData?.columns as string[] ||
        (rows.length > 0 ? Object.keys(rows[0] as object) : [])

      context.tableData = {
        title: tableData?.title as string || 'Data Table',
        columns,
        rowCount: rows.length,
        summary: this.describeTableData(tableData),
      }
      context.summary = `Generated table: "${context.tableData.title}" with ${rows.length} rows`
      context.dataPoints = this.extractTableDataPoints(tableData)
      return context
    }

    // Handle calculation results
    if (toolName === 'financial_calc' || toolName.includes('calc')) {
      context.summary = this.describeCalculationResult(resultObj)
      context.dataPoints = this.extractCalculationDataPoints(resultObj)
      return context
    }

    // Handle search results
    if (toolName === 'search_documents' || toolName.includes('search')) {
      const citations = resultObj.citations as unknown[] || []
      context.summary = `Found ${citations.length} relevant document sections`
      return context
    }

    // Handle generic results with data
    if (resultObj.data) {
      context.summary = `Tool "${toolName}" returned data`
      return context
    }

    return null
  }

  /**
   * Describe chart data for context
   */
  private describeChartData(chartData: Record<string, unknown> | undefined): string {
    if (!chartData) return 'No data'

    const data = chartData.data as unknown[]
    if (!data || !Array.isArray(data)) return 'No data points'

    const dataKeys = data.length > 0 ? Object.keys(data[0] as object) : []
    return `${data.length} data points with fields: ${dataKeys.join(', ')}`
  }

  /**
   * Extract key data points from chart
   */
  private extractChartDataPoints(chartData: Record<string, unknown> | undefined): DataPoint[] {
    if (!chartData) return []

    const data = chartData.data as Record<string, unknown>[]
    if (!data || !Array.isArray(data) || data.length === 0) return []

    const dataPoints: DataPoint[] = []
    const numericKeys = Object.keys(data[0]).filter(key => typeof data[0][key] === 'number')

    // Get first, last, and middle values for context
    const indices = [0, Math.floor(data.length / 2), data.length - 1]
    for (const idx of indices) {
      if (data[idx]) {
        const item = data[idx]
        const labelKey = Object.keys(item).find(k => typeof item[k] === 'string') || 'Item'
        for (const key of numericKeys.slice(0, 2)) {
          dataPoints.push({
            label: `${item[labelKey] || `Item ${idx + 1}`} - ${key}`,
            value: item[key] as number,
          })
        }
      }
    }

    return dataPoints.slice(0, 6) // Limit to 6 data points
  }

  /**
   * Describe table data for context
   */
  private describeTableData(tableData: Record<string, unknown> | undefined): string {
    if (!tableData) return 'No data'

    const rows = tableData.rows as unknown[] || tableData.data as unknown[] || []
    const columns = tableData.columns as string[] ||
      (rows.length > 0 ? Object.keys(rows[0] as object) : [])

    return `Table with ${rows.length} rows and columns: ${columns.slice(0, 5).join(', ')}${columns.length > 5 ? '...' : ''}`
  }

  /**
   * Extract key data points from table
   */
  private extractTableDataPoints(tableData: Record<string, unknown> | undefined): DataPoint[] {
    if (!tableData) return []

    const rows = tableData.rows as Record<string, unknown>[] ||
                 tableData.data as Record<string, unknown>[] || []
    if (rows.length === 0) return []

    const dataPoints: DataPoint[] = []
    const firstRow = rows[0]
    const labelKey = Object.keys(firstRow).find(k => typeof firstRow[k] === 'string') || Object.keys(firstRow)[0]

    // Get first few rows as data points
    for (const row of rows.slice(0, 3)) {
      const numericKeys = Object.keys(row).filter(k => typeof row[k] === 'number')
      for (const key of numericKeys.slice(0, 2)) {
        dataPoints.push({
          label: `${row[labelKey] || 'Row'} - ${key}`,
          value: row[key] as number,
        })
      }
    }

    return dataPoints.slice(0, 6)
  }

  /**
   * Describe calculation result
   */
  private describeCalculationResult(result: Record<string, unknown>): string {
    const operation = result.operation as string || 'calculation'
    const value = result.result ?? result.value

    if (value !== undefined) {
      return `Performed ${operation}: result = ${value}`
    }
    return `Performed ${operation}`
  }

  /**
   * Extract data points from calculation
   */
  private extractCalculationDataPoints(result: Record<string, unknown>): DataPoint[] {
    const dataPoints: DataPoint[] = []

    // Common calculation result fields
    const fields = ['result', 'value', 'variance', 'percentage', 'roi', 'npv', 'total']
    for (const field of fields) {
      if (typeof result[field] === 'number') {
        dataPoints.push({
          label: field.charAt(0).toUpperCase() + field.slice(1),
          value: result[field] as number,
          unit: field.includes('percent') || field.includes('roi') ? '%' : undefined,
        })
      }
    }

    return dataPoints.slice(0, 4)
  }

  /**
   * Get recent context entries
   */
  getRecentContext(limit: number = 5): ToolContext[] {
    return this.contexts.slice(-limit)
  }

  /**
   * Get all contexts
   */
  getAllContexts(): ToolContext[] {
    return [...this.contexts]
  }

  /**
   * Build a formatted string for image generation prompt
   */
  buildImagePromptContext(): string {
    const recent = this.getRecentContext(5)
    if (recent.length === 0) {
      return ''
    }

    const parts: string[] = ['## Analysis Context\n']

    for (const ctx of recent) {
      parts.push(`### ${ctx.toolName}`)
      parts.push(ctx.summary)

      if (ctx.dataPoints && ctx.dataPoints.length > 0) {
        parts.push('\nKey values:')
        for (const dp of ctx.dataPoints) {
          const unit = dp.unit || ''
          parts.push(`- ${dp.label}: ${dp.value}${unit}`)
        }
      }

      if (ctx.chartConfig) {
        parts.push(`\nChart: ${ctx.chartConfig.type} showing ${ctx.chartConfig.dataDescription}`)
      }

      if (ctx.tableData) {
        parts.push(`\nTable: ${ctx.tableData.summary}`)
      }

      parts.push('')
    }

    const result = parts.join('\n')
    // Truncate if too long (keep under 2000 chars for prompt efficiency)
    return result.length > 2000 ? result.slice(0, 1997) + '...' : result
  }

  /**
   * Check if there's any context available
   */
  hasContext(): boolean {
    return this.contexts.length > 0
  }

  /**
   * Get the count of contexts
   */
  getContextCount(): number {
    return this.contexts.length
  }

  /**
   * Clear all accumulated context
   */
  clear(): void {
    this.contexts = []
  }
}

/**
 * Create a new tool context accumulator instance
 */
export function createToolContextAccumulator(): ToolContextAccumulator {
  return new ToolContextAccumulator()
}
