'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  RadialBarChart,
  RadialBar,
} from 'recharts'
import { TrendingUp, BarChart3, PieChartIcon, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChartData {
  chartType: 'line' | 'bar' | 'pie' | 'area' | 'scatter' | 'combo'
  title: string
  data: Record<string, unknown>[]
  xAxisKey?: string
  yAxisKeys?: string[]
  xAxisLabel?: string
  yAxisLabel?: string
  colors?: string[]
  config?: Record<string, unknown>
}

interface DynamicChartProps {
  data: { data: unknown } | ChartData
}

// Stunning vibrant color palette with gradients
const CHART_COLORS = [
  { main: '#6366F1', light: '#A5B4FC', dark: '#4338CA', gradient: ['#6366F1', '#8B5CF6'] }, // Indigo-Purple
  { main: '#14B8A6', light: '#5EEAD4', dark: '#0D9488', gradient: ['#14B8A6', '#22D3EE'] }, // Teal-Cyan
  { main: '#F59E0B', light: '#FCD34D', dark: '#D97706', gradient: ['#F59E0B', '#FB923C'] }, // Amber-Orange
  { main: '#EC4899', light: '#F9A8D4', dark: '#DB2777', gradient: ['#EC4899', '#F472B6'] }, // Pink
  { main: '#3B82F6', light: '#93C5FD', dark: '#1D4ED8', gradient: ['#3B82F6', '#60A5FA'] }, // Blue
  { main: '#10B981', light: '#6EE7B7', dark: '#059669', gradient: ['#10B981', '#34D399'] }, // Emerald
  { main: '#8B5CF6', light: '#C4B5FD', dark: '#7C3AED', gradient: ['#8B5CF6', '#A78BFA'] }, // Purple
  { main: '#EF4444', light: '#FCA5A5', dark: '#DC2626', gradient: ['#EF4444', '#F87171'] }, // Red
  { main: '#06B6D4', light: '#67E8F9', dark: '#0891B2', gradient: ['#06B6D4', '#22D3EE'] }, // Cyan
  { main: '#84CC16', light: '#BEF264', dark: '#65A30D', gradient: ['#84CC16', '#A3E635'] }, // Lime
]

const COLORS = CHART_COLORS.map(c => c.main)

// Chart type icons and labels
const CHART_TYPE_CONFIG = {
  line: { icon: TrendingUp, label: 'Trend Analysis', gradient: 'from-indigo-500 to-purple-600' },
  bar: { icon: BarChart3, label: 'Comparison', gradient: 'from-blue-500 to-cyan-600' },
  pie: { icon: PieChartIcon, label: 'Distribution', gradient: 'from-pink-500 to-rose-600' },
  area: { icon: Activity, label: 'Growth Pattern', gradient: 'from-emerald-500 to-teal-600' },
  scatter: { icon: Activity, label: 'Correlation', gradient: 'from-amber-500 to-orange-600' },
  combo: { icon: BarChart3, label: 'Multi-metric', gradient: 'from-purple-500 to-indigo-600' },
}

// Custom tooltip with stunning styling
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null

  return (
    <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg rounded-xl shadow-2xl border border-slate-200/50 dark:border-slate-700/50 p-4 min-w-[180px] animate-in fade-in-50 zoom-in-95 duration-200">
      {/* Decorative gradient bar */}
      <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

      <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800 uppercase tracking-wide">
        {label}
      </p>
      <div className="space-y-2.5">
        {payload.map((entry: any, index: number) => {
          const isPositive = typeof entry.value === 'number' && entry.value >= 0
          return (
            <div key={index} className="flex items-center justify-between gap-4 group">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-3.5 h-3.5 rounded-full shadow-lg ring-2 ring-white dark:ring-slate-800"
                  style={{
                    backgroundColor: entry.color,
                    boxShadow: `0 0 10px ${entry.color}50`
                  }}
                />
                <span className="text-sm text-slate-600 dark:text-slate-300 capitalize font-medium">
                  {entry.name?.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {typeof entry.value === 'number' && (
                  isPositive
                    ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                    : <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
                )}
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {typeof entry.value === 'number'
                    ? entry.value >= 1000000
                      ? `$${(entry.value / 1000000).toFixed(2)}M`
                      : entry.value >= 1000
                        ? `$${(entry.value / 1000).toFixed(1)}K`
                        : entry.value.toLocaleString()
                    : entry.value}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Custom legend with stunning styling
const CustomLegend = ({ payload }: any) => {
  if (!payload || !payload.length) return null

  return (
    <div className="flex flex-wrap justify-center gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
      {payload.map((entry: any, index: number) => (
        <div
          key={index}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all duration-200 cursor-default"
        >
          <div
            className="w-3 h-3 rounded-full shadow-sm"
            style={{
              backgroundColor: entry.color,
              boxShadow: `0 0 8px ${entry.color}40`
            }}
          />
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300 capitalize">
            {entry.value?.replace(/_/g, ' ')}
          </span>
        </div>
      ))}
    </div>
  )
}

export function DynamicChart({ data }: DynamicChartProps) {
  // All hooks must be called unconditionally at the top
  const chartData = useMemo(() => {
    // Handle multiple levels of nesting that might occur
    let current = data as any

    // Unwrap nested data objects until we find chartType
    while (current && typeof current === 'object' && !current.chartType && current.data) {
      current = current.data
    }

    // If we have an array but no chartType, try to infer chart structure
    if (Array.isArray(current) && current.length > 0) {
      // This is raw data array - wrap it in a chart structure
      const firstItem = current[0]
      const keys = Object.keys(firstItem)
      const xAxisKey = keys.find(k =>
        typeof firstItem[k] === 'string' ||
        k.toLowerCase().includes('name') ||
        k.toLowerCase().includes('label') ||
        k.toLowerCase().includes('category') ||
        k.toLowerCase() === 'metric'
      ) || keys[0]
      const yAxisKeys = keys.filter(k =>
        k !== xAxisKey && typeof firstItem[k] === 'number'
      )

      return {
        chartType: 'bar' as const,
        title: 'Data Visualization',
        data: current,
        xAxisKey,
        yAxisKeys,
      } as ChartData
    }

    // If still no chartType but we have data array property
    if (current && !current.chartType && Array.isArray(current.data)) {
      const dataArray = current.data
      if (dataArray.length > 0) {
        const firstItem = dataArray[0]
        const keys = Object.keys(firstItem)
        const xAxisKey = keys.find(k =>
          typeof firstItem[k] === 'string' ||
          k.toLowerCase().includes('name') ||
          k.toLowerCase().includes('label') ||
          k.toLowerCase().includes('category') ||
          k.toLowerCase() === 'metric'
        ) || keys[0]
        const yAxisKeys = keys.filter(k =>
          k !== xAxisKey && typeof firstItem[k] === 'number'
        )

        return {
          chartType: 'bar' as const,
          title: current.title || 'Data Visualization',
          data: dataArray,
          xAxisKey,
          yAxisKeys,
        } as ChartData
      }
    }

    return current as ChartData
  }, [data])

  // Extract values safely - these must be called before any early returns
  const chartType = chartData?.chartType
  const title = chartData?.title
  const points = chartData?.data
  const xAxisLabel = chartData?.xAxisLabel
  const yAxisLabel = chartData?.yAxisLabel
  const xAxisKey = chartData?.xAxisKey
  const yAxisKeys = chartData?.yAxisKeys

  // Use provided xAxisKey or default to 'name'
  const actualXAxisKey = xAxisKey || 'name'

  // Get data keys - use yAxisKeys if provided, otherwise auto-detect
  // This hook must be called unconditionally
  const dataKeys = useMemo(() => {
    if (yAxisKeys && yAxisKeys.length > 0) return yAxisKeys
    if (!points || points.length === 0) return []
    const keys = Object.keys(points[0]).filter((k) => k !== actualXAxisKey && k !== 'name' && k !== 'label')
    return keys
  }, [points, yAxisKeys, actualXAxisKey])

  // Calculate summary stats - must be called unconditionally
  const summaryStats = useMemo(() => {
    if (!points || points.length === 0) return null

    const values = points.map(p => {
      const numericKeys = Object.keys(p).filter(k =>
        k !== actualXAxisKey && typeof p[k] === 'number'
      )
      return numericKeys.length > 0 ? (p[numericKeys[0]] as number) : 0
    })

    const total = values.reduce((a, b) => a + b, 0)
    const avg = total / values.length
    const max = Math.max(...values)
    const min = Math.min(...values)

    return { total, avg, max, min, count: points.length }
  }, [points, actualXAxisKey])

  // Now we can do early return after all hooks are called
  if (!chartData || !chartType || !points) {
    console.log('DynamicChart: Invalid data structure', { chartData, originalData: data })
    return (
      <div className="p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center">
          <BarChart3 className="w-8 h-8 text-slate-400" />
        </div>
        <p className="text-muted-foreground font-medium">No chart data available</p>
        <p className="text-sm text-muted-foreground/70 mt-1">Data will appear here when generated</p>
      </div>
    )
  }

  // Format axis tick values
  const formatAxisValue = (value: number) => {
    if (Math.abs(value) >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`
    } else if (Math.abs(value) >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`
    }
    return value.toLocaleString()
  }

  const renderChart = () => {
    const commonAxisProps = {
      tick: { fontSize: 12, fill: '#64748B' },
      axisLine: { stroke: '#E2E8F0' },
      tickLine: { stroke: '#E2E8F0' },
    }

    switch (chartType) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={points} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <defs>
                {dataKeys.map((key, index) => (
                  <linearGradient key={`gradient-${key}`} id={`lineGradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS[index % CHART_COLORS.length].main} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={CHART_COLORS[index % CHART_COLORS.length].main} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis
                dataKey={actualXAxisKey}
                {...commonAxisProps}
                label={xAxisLabel ? { value: xAxisLabel, position: 'insideBottom', offset: -10, style: { fontSize: 12, fill: '#64748B' } } : undefined}
              />
              <YAxis
                {...commonAxisProps}
                tickFormatter={formatAxisValue}
                label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: '#64748B' } } : undefined}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend content={<CustomLegend />} />
              {dataKeys.map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={CHART_COLORS[index % CHART_COLORS.length].main}
                  strokeWidth={3}
                  dot={{ r: 5, fill: '#fff', stroke: CHART_COLORS[index % CHART_COLORS.length].main, strokeWidth: 2 }}
                  activeDot={{ r: 7, fill: CHART_COLORS[index % CHART_COLORS.length].main, stroke: '#fff', strokeWidth: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={points} margin={{ top: 20, right: 30, left: 20, bottom: 20 }} barCategoryGap="20%">
              <defs>
                {dataKeys.map((key, index) => (
                  <linearGradient key={`gradient-${key}`} id={`barGradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS[index % CHART_COLORS.length].main} stopOpacity={1} />
                    <stop offset="100%" stopColor={CHART_COLORS[index % CHART_COLORS.length].dark} stopOpacity={1} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey={actualXAxisKey} {...commonAxisProps} />
              <YAxis {...commonAxisProps} tickFormatter={formatAxisValue} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }} />
              <Legend content={<CustomLegend />} />
              <ReferenceLine y={0} stroke="#94A3B8" strokeWidth={1} />
              {dataKeys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={`url(#barGradient-${index})`}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={60}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={320}>
            <PieChart margin={{ top: 20, right: 30, left: 30, bottom: 20 }}>
              <defs>
                {points.map((_, index) => (
                  <linearGradient key={`pieGradient-${index}`} id={`pieGradient-${index}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS[index % CHART_COLORS.length].light} stopOpacity={1} />
                    <stop offset="100%" stopColor={CHART_COLORS[index % CHART_COLORS.length].main} stopOpacity={1} />
                  </linearGradient>
                ))}
              </defs>
              <Pie
                data={points}
                cx="50%"
                cy="45%"
                labelLine={{ stroke: '#94A3B8', strokeWidth: 1 }}
                label={({ name, percent }: any) => `${name || ''} ${((percent || 0) * 100).toFixed(0)}%`}
                outerRadius={100}
                innerRadius={40}
                fill="#8884d8"
                dataKey={dataKeys[0] || 'value'}
                paddingAngle={2}
                stroke="#fff"
                strokeWidth={2}
              >
                {points.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={`url(#pieGradient-${index})`}
                    style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.1))' }}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend content={<CustomLegend />} />
            </PieChart>
          </ResponsiveContainer>
        )

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={points} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <defs>
                {dataKeys.map((key, index) => (
                  <linearGradient key={`areaGradient-${key}`} id={`areaGradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS[index % CHART_COLORS.length].main} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={CHART_COLORS[index % CHART_COLORS.length].main} stopOpacity={0.05} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey={actualXAxisKey} {...commonAxisProps} />
              <YAxis {...commonAxisProps} tickFormatter={formatAxisValue} />
              <Tooltip content={<CustomTooltip />} />
              <Legend content={<CustomLegend />} />
              {dataKeys.map((key, index) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={CHART_COLORS[index % CHART_COLORS.length].main}
                  strokeWidth={2}
                  fill={`url(#areaGradient-${index})`}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )

      default:
        return (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={points} margin={{ top: 20, right: 30, left: 20, bottom: 20 }} barCategoryGap="20%">
              <defs>
                {dataKeys.map((key, index) => (
                  <linearGradient key={`gradient-${key}`} id={`defaultGradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS[index % CHART_COLORS.length].main} stopOpacity={1} />
                    <stop offset="100%" stopColor={CHART_COLORS[index % CHART_COLORS.length].dark} stopOpacity={1} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey={actualXAxisKey} {...commonAxisProps} />
              <YAxis {...commonAxisProps} tickFormatter={formatAxisValue} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }} />
              <Legend content={<CustomLegend />} />
              {dataKeys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={`url(#defaultGradient-${index})`}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={60}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )
    }
  }

  const chartConfig = CHART_TYPE_CONFIG[chartType] || CHART_TYPE_CONFIG.bar
  const ChartIcon = chartConfig.icon

  return (
    <div className="w-full p-6 bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/20">
      {/* Header Section */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2.5 rounded-xl shadow-lg",
            `bg-gradient-to-br ${chartConfig.gradient}`
          )}>
            <ChartIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
              {title || 'Financial Chart'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span className={cn(
                "px-2 py-0.5 rounded-full text-xs font-medium",
                "bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700",
                "text-slate-600 dark:text-slate-300"
              )}>
                {chartConfig.label}
              </span>
              <span className="text-slate-400">•</span>
              <span>{points.length} data points</span>
            </p>
          </div>
        </div>

        {/* Quick Stats */}
        {summaryStats && chartType !== 'pie' && (
          <div className="hidden sm:flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-100 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/40 border border-emerald-200 dark:border-emerald-800">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Avg</p>
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                ${summaryStats.avg >= 1000 ? `${(summaryStats.avg / 1000).toFixed(1)}K` : summaryStats.avg.toFixed(0)}
              </p>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40 border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Max</p>
              <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
                ${summaryStats.max >= 1000 ? `${(summaryStats.max / 1000).toFixed(1)}K` : summaryStats.max.toFixed(0)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Chart Container */}
      <div className="bg-white dark:bg-slate-900/80 rounded-2xl shadow-xl border border-slate-200/60 dark:border-slate-700/60 overflow-hidden backdrop-blur-sm">
        {/* Decorative gradient bar */}
        <div className={cn(
          "h-1.5 bg-gradient-to-r",
          chartType === 'line' ? "from-indigo-500 via-purple-500 to-pink-500" :
          chartType === 'bar' ? "from-blue-500 via-cyan-500 to-teal-500" :
          chartType === 'pie' ? "from-pink-500 via-rose-500 to-red-500" :
          chartType === 'area' ? "from-emerald-500 via-teal-500 to-cyan-500" :
          "from-amber-500 via-orange-500 to-red-500"
        )} />

        <div className="p-6">
          {renderChart()}
        </div>
      </div>

      {/* Footer Stats */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Chart type badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40 border border-indigo-200 dark:border-indigo-800">
            <ChartIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300 capitalize">
              {chartType}
            </span>
          </div>
          {/* Data keys */}
          {dataKeys.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 border border-slate-200 dark:border-slate-600">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {dataKeys.length} series
              </span>
            </div>
          )}
        </div>

        <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
          <Activity className="w-3 h-3" />
          Interactive • Hover for details
        </span>
      </div>
    </div>
  )
}
