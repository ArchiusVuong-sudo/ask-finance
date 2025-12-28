'use client'

import { useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ArrowUp, ArrowDown, Minus, TrendingUp, TrendingDown, Activity, DollarSign, Percent, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TableData {
  title?: string
  columns?: string[]
  rows?: Record<string, unknown>[]
  data?: Record<string, unknown>[]
}

interface DataTableProps {
  data: { data: unknown } | TableData
}

// Stunning gradient color schemes for different data types
const GRADIENT_SCHEMES = [
  { bg: 'from-blue-500/10 to-indigo-500/10', border: 'border-blue-200 dark:border-blue-800', accent: 'bg-blue-500' },
  { bg: 'from-emerald-500/10 to-teal-500/10', border: 'border-emerald-200 dark:border-emerald-800', accent: 'bg-emerald-500' },
  { bg: 'from-purple-500/10 to-pink-500/10', border: 'border-purple-200 dark:border-purple-800', accent: 'bg-purple-500' },
  { bg: 'from-amber-500/10 to-orange-500/10', border: 'border-amber-200 dark:border-amber-800', accent: 'bg-amber-500' },
  { bg: 'from-cyan-500/10 to-blue-500/10', border: 'border-cyan-200 dark:border-cyan-800', accent: 'bg-cyan-500' },
]

// Header gradient colors
const HEADER_GRADIENTS = [
  'from-blue-600 via-indigo-600 to-purple-600',
  'from-emerald-600 via-teal-600 to-cyan-600',
  'from-purple-600 via-pink-600 to-rose-600',
  'from-amber-600 via-orange-600 to-red-600',
]

export function DataTable({ data }: DataTableProps) {
  const tableData = useMemo(() => {
    // Handle multiple levels of nesting that might occur
    let current = data as any

    // Unwrap nested data objects until we find rows or columns
    while (current && typeof current === 'object' && !current.rows && !current.columns && current.data) {
      current = current.data
    }

    return current as TableData
  }, [data])

  const rows = tableData.rows || tableData.data || []
  const columns = useMemo(() => {
    if (tableData.columns) return tableData.columns
    if (rows.length > 0) {
      return Object.keys(rows[0])
    }
    return []
  }, [tableData.columns, rows])

  // Determine column types for intelligent formatting
  const columnTypes = useMemo(() => {
    const types: Record<string, 'currency' | 'percentage' | 'number' | 'status' | 'text'> = {}
    columns.forEach((col) => {
      const lowerCol = col.toLowerCase()
      if (lowerCol.includes('amount') || lowerCol.includes('revenue') || lowerCol.includes('cost') ||
          lowerCol.includes('budget') || lowerCol.includes('actual') || lowerCol.includes('price') ||
          lowerCol.includes('value') || lowerCol.includes('total')) {
        types[col] = 'currency'
      } else if (lowerCol.includes('percent') || lowerCol.includes('rate') || lowerCol.includes('margin') ||
                 lowerCol.includes('growth') || lowerCol.includes('change') || lowerCol.includes('variance')) {
        types[col] = 'percentage'
      } else if (lowerCol.includes('status') || lowerCol.includes('indicator') || lowerCol.includes('result')) {
        types[col] = 'status'
      } else {
        types[col] = 'text'
      }
    })
    return types
  }, [columns])

  if (!rows || rows.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center">
          <Activity className="w-8 h-8 text-slate-400" />
        </div>
        <p className="text-muted-foreground font-medium">No table data available</p>
        <p className="text-sm text-muted-foreground/70 mt-1">Data will appear here when generated</p>
      </div>
    )
  }

  const getColumnIcon = (col: string) => {
    const type = columnTypes[col]
    switch (type) {
      case 'currency':
        return <DollarSign className="w-3.5 h-3.5" />
      case 'percentage':
        return <Percent className="w-3.5 h-3.5" />
      case 'number':
        return <Hash className="w-3.5 h-3.5" />
      default:
        return null
    }
  }

  const formatValue = (value: unknown, key: string, rowIndex: number): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-slate-300 dark:text-slate-600">—</span>
    }

    const scheme = GRADIENT_SCHEMES[rowIndex % GRADIENT_SCHEMES.length]

    // Format numbers
    if (typeof value === 'number') {
      // Check if it looks like a percentage
      if (columnTypes[key] === 'percentage' || key.toLowerCase().includes('percent') || key.toLowerCase().includes('rate')) {
        const formatted = Math.abs(value).toFixed(2) + '%'
        const isPositive = value > 0
        const isNegative = value < 0
        return (
          <div className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-sm font-semibold',
            isPositive && 'bg-gradient-to-r from-emerald-500/20 to-green-500/20 text-emerald-700 dark:text-emerald-300',
            isNegative && 'bg-gradient-to-r from-red-500/20 to-rose-500/20 text-red-700 dark:text-red-300',
            !isPositive && !isNegative && 'bg-gradient-to-r from-slate-500/20 to-gray-500/20 text-slate-700 dark:text-slate-300'
          )}>
            {isPositive && <TrendingUp className="w-3.5 h-3.5" />}
            {isNegative && <TrendingDown className="w-3.5 h-3.5" />}
            {!isPositive && !isNegative && <Minus className="w-3.5 h-3.5" />}
            {isPositive && '+'}
            {formatted}
          </div>
        )
      }

      // Check if it looks like currency
      if (columnTypes[key] === 'currency' || Math.abs(value) >= 1000) {
        const isLarge = Math.abs(value) >= 1000000
        const formatted = isLarge
          ? `$${(value / 1000000).toFixed(2)}M`
          : `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

        return (
          <div className="inline-flex items-center gap-1.5">
            <span className={cn(
              'px-2 py-0.5 rounded font-mono text-sm font-semibold',
              'bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-700',
              'text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600'
            )}>
              {formatted}
            </span>
          </div>
        )
      }

      return <span className="font-mono text-slate-700 dark:text-slate-300 font-medium">{value.toLocaleString()}</span>
    }

    // Format variance indicators with stunning badges
    if (typeof value === 'string') {
      // Variance badges
      if (value.toLowerCase() === 'favorable') {
        return (
          <Badge className="bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0 shadow-md shadow-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/40 transition-all">
            <TrendingUp className="w-3 h-3 mr-1" />
            Favorable
          </Badge>
        )
      }
      if (value.toLowerCase() === 'unfavorable') {
        return (
          <Badge className="bg-gradient-to-r from-red-500 to-rose-500 text-white border-0 shadow-md shadow-red-500/30 hover:shadow-lg hover:shadow-red-500/40 transition-all">
            <TrendingDown className="w-3 h-3 mr-1" />
            Unfavorable
          </Badge>
        )
      }
      if (value.toLowerCase() === 'neutral') {
        return (
          <Badge className="bg-gradient-to-r from-slate-400 to-slate-500 text-white border-0 shadow-md shadow-slate-500/30">
            <Minus className="w-3 h-3 mr-1" />
            Neutral
          </Badge>
        )
      }
      if (value.toLowerCase() === 'positive' || value.toLowerCase() === 'up') {
        return (
          <Badge className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-0 shadow-md shadow-blue-500/30">
            <ArrowUp className="w-3 h-3 mr-1" />
            {value}
          </Badge>
        )
      }
      if (value.toLowerCase() === 'negative' || value.toLowerCase() === 'down') {
        return (
          <Badge className="bg-gradient-to-r from-orange-500 to-amber-500 text-white border-0 shadow-md shadow-orange-500/30">
            <ArrowDown className="w-3 h-3 mr-1" />
            {value}
          </Badge>
        )
      }
    }

    return <span className="text-slate-700 dark:text-slate-300">{String(value)}</span>
  }

  const formatHeader = (key: string): string => {
    // Convert camelCase or snake_case to Title Case
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase())
      .trim()
  }

  return (
    <div className="w-full p-6 bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/20">
      {/* Title Section */}
      {tableData.title && (
        <div className="mb-6 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
              {tableData.title}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Financial Data Analysis</p>
          </div>
        </div>
      )}

      {/* Table Container with stunning styling */}
      <div className="bg-white dark:bg-slate-900/80 rounded-2xl shadow-xl border border-slate-200/60 dark:border-slate-700/60 overflow-hidden backdrop-blur-sm">
        {/* Decorative top gradient bar */}
        <div className="h-1.5 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gradient-to-r from-slate-50 via-slate-100 to-slate-50 dark:from-slate-800 dark:via-slate-750 dark:to-slate-800 border-b-2 border-slate-200 dark:border-slate-700">
                {columns.map((column, index) => (
                  <TableHead
                    key={column}
                    className={cn(
                      "py-4 px-5 font-bold text-sm tracking-wide uppercase",
                      index === 0
                        ? "text-slate-800 dark:text-white"
                        : "text-slate-600 dark:text-slate-300"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {getColumnIcon(column) && (
                        <div className={cn(
                          "p-1 rounded-md",
                          "bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600"
                        )}>
                          {getColumnIcon(column)}
                        </div>
                      )}
                      {formatHeader(column)}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => {
                const scheme = GRADIENT_SCHEMES[rowIndex % GRADIENT_SCHEMES.length]
                return (
                  <TableRow
                    key={rowIndex}
                    className={cn(
                      "group transition-all duration-300 cursor-default",
                      "hover:shadow-lg hover:z-10 relative",
                      rowIndex % 2 === 0
                        ? "bg-white dark:bg-slate-900"
                        : "bg-slate-50/70 dark:bg-slate-800/50",
                      "hover:bg-gradient-to-r",
                      `hover:${scheme.bg}`
                    )}
                  >
                    {columns.map((column, colIndex) => (
                      <TableCell
                        key={column}
                        className={cn(
                          "py-4 px-5 transition-all duration-200",
                          colIndex === 0 && "font-semibold text-slate-900 dark:text-white",
                          "group-hover:transform group-hover:translate-x-0.5"
                        )}
                      >
                        {/* Colorful indicator for first column */}
                        {colIndex === 0 && (
                          <div className={cn(
                            "absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full opacity-0 group-hover:opacity-100 transition-opacity",
                            scheme.accent
                          )} />
                        )}
                        {formatValue(row[column], column, rowIndex)}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Footer with stats */}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span>{columns.length} column{columns.length !== 1 ? 's' : ''}</span>
        </div>
        <span className="flex items-center gap-1">
          <Activity className="w-3 h-3" />
          {new Date().toLocaleTimeString()}
        </span>
      </div>
    </div>
  )
}
