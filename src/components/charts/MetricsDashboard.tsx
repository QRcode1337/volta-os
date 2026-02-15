import { useState, useEffect } from 'react'
import Chart from 'react-apexcharts'
import type { ApexOptions } from 'apexcharts'
import { Activity, Cpu, HardDrive, Wifi, Zap, TrendingUp, Clock } from 'lucide-react'

interface Metric {
  label: string
  value: number
  unit: string
  trend: 'up' | 'down' | 'stable'
  color: string
  icon: React.ReactNode
  history: number[]
}

interface MetricsDashboardProps {
  metrics?: Metric[]
  refreshIntervalMs?: number
}

function generateHistory(base: number, variance: number, points: number = 20): number[] {
  const history: number[] = []
  let current = base
  for (let i = 0; i < points; i++) {
    current += (Math.random() - 0.5) * variance
    current = Math.max(0, Math.min(100, current))
    history.push(Math.round(current * 10) / 10)
  }
  return history
}

const DEFAULT_METRICS: Metric[] = [
  { label: 'CPU Usage', value: 34, unit: '%', trend: 'up', color: '#00FFFF', icon: <Cpu className="w-4 h-4" />, history: generateHistory(34, 15) },
  { label: 'Memory', value: 62, unit: '%', trend: 'stable', color: '#FF00FF', icon: <HardDrive className="w-4 h-4" />, history: generateHistory(62, 8) },
  { label: 'Network I/O', value: 1.2, unit: 'MB/s', trend: 'down', color: '#00FF00', icon: <Wifi className="w-4 h-4" />, history: generateHistory(45, 20) },
  { label: 'Token Rate', value: 847, unit: 'tok/m', trend: 'up', color: '#FF006E', icon: <Zap className="w-4 h-4" />, history: generateHistory(60, 25) },
  { label: 'API Latency', value: 142, unit: 'ms', trend: 'stable', color: '#FFD700', icon: <Clock className="w-4 h-4" />, history: generateHistory(50, 12) },
  { label: 'Agent Tasks', value: 23, unit: 'active', trend: 'up', color: '#00FFFF', icon: <Activity className="w-4 h-4" />, history: generateHistory(40, 18) },
]

function MiniSparkline({ data, color, height = 40 }: { data: number[]; color: string; height?: number }) {
  const options: ApexOptions = {
    chart: {
      type: 'line',
      sparkline: { enabled: true },
      animations: { enabled: true, speed: 500 },
      dropShadow: {
        enabled: true,
        top: 1,
        left: 0,
        blur: 4,
        opacity: 0.3,
        color,
      },
    },
    stroke: {
      curve: 'smooth',
      width: 1.5,
    },
    colors: [color],
    tooltip: { enabled: false },
    fill: {
      type: 'gradient',
      gradient: {
        opacityFrom: 0.3,
        opacityTo: 0.0,
        stops: [0, 100],
      },
    },
  }

  const series = [{ data }]

  return <Chart options={options} series={series} type="area" height={height} width="100%" />
}

function NeonNumber({ value, unit, color }: { value: number | string; unit: string; color: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className="text-2xl font-bold font-mono tabular-nums"
        style={{
          color,
          textShadow: `0 0 8px ${color}80, 0 0 20px ${color}30`,
        }}
      >
        {value}
      </span>
      <span className="text-[10px] text-gray-500 uppercase font-mono">{unit}</span>
    </div>
  )
}

function TrendIndicator({ trend, color }: { trend: 'up' | 'down' | 'stable'; color: string }) {
  if (trend === 'up') {
    return (
      <div className="flex items-center gap-0.5" style={{ color }}>
        <TrendingUp className="w-3 h-3" />
        <span className="text-[9px] font-mono">+2.4%</span>
      </div>
    )
  }
  if (trend === 'down') {
    return (
      <div className="flex items-center gap-0.5 text-green-400">
        <TrendingUp className="w-3 h-3 rotate-180" />
        <span className="text-[9px] font-mono">-1.8%</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-0.5 text-gray-500">
      <span className="text-[9px] font-mono">~0.0%</span>
    </div>
  )
}

function MetricCard({ metric }: { metric: Metric }) {
  return (
    <div className="bg-bg-void rounded-lg border border-neon-pink/8 p-4 relative overflow-hidden group hover:border-neon-cyan/20 transition-colors duration-300">
      {/* Scanline overlay on hover */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500">
        <div className="w-full h-[200%] animate-scanline bg-gradient-to-b from-transparent via-neon-cyan/20 to-transparent" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-2 relative z-10">
        <div className="flex items-center gap-2">
          <div style={{ color: metric.color }}>{metric.icon}</div>
          <span className="text-xs text-gray-400 font-medium">{metric.label}</span>
        </div>
        <TrendIndicator trend={metric.trend} color={metric.color} />
      </div>

      {/* Value */}
      <div className="mb-2 relative z-10">
        <NeonNumber value={metric.value} unit={metric.unit} color={metric.color} />
      </div>

      {/* Sparkline */}
      <div className="relative z-10 -mx-2 -mb-2">
        <MiniSparkline data={metric.history} color={metric.color} height={45} />
      </div>

      {/* Bottom glow */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[1px] opacity-30"
        style={{ background: `linear-gradient(90deg, transparent, ${metric.color}, transparent)` }}
      />
    </div>
  )
}

export default function MetricsDashboard({
  metrics: externalMetrics,
  refreshIntervalMs = 3000,
}: MetricsDashboardProps) {
  const [metrics, setMetrics] = useState<Metric[]>(externalMetrics || DEFAULT_METRICS)

  useEffect(() => {
    if (externalMetrics) {
      setMetrics(externalMetrics)
      return
    }

    const interval = setInterval(() => {
      setMetrics((prev) =>
        prev.map((m) => {
          const delta = (Math.random() - 0.5) * 10
          const newValue = Math.round((m.value + delta) * 10) / 10
          const clampedValue = Math.max(0, newValue)
          const newHistory = [...m.history.slice(1), clampedValue]
          const trend: 'up' | 'down' | 'stable' =
            newHistory[newHistory.length - 1] > newHistory[newHistory.length - 4]
              ? 'up'
              : newHistory[newHistory.length - 1] < newHistory[newHistory.length - 4]
                ? 'down'
                : 'stable'
          return { ...m, value: clampedValue, history: newHistory, trend }
        })
      )
    }, refreshIntervalMs)

    return () => clearInterval(interval)
  }, [externalMetrics, refreshIntervalMs])

  // Overall status
  const avgLoad = metrics.reduce((s, m) => s + (m.unit === '%' ? m.value : 0), 0) / metrics.filter((m) => m.unit === '%').length || 0
  const statusColor = avgLoad > 80 ? '#FF0000' : avgLoad > 60 ? '#FFD700' : '#00FF00'
  const statusLabel = avgLoad > 80 ? 'CRITICAL' : avgLoad > 60 ? 'ELEVATED' : 'NOMINAL'

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between bg-bg-void rounded-lg border border-neon-pink/8 px-4 py-3">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-amber-400" />
          <div>
            <h3 className="text-sm font-semibold text-gray-200">Performance Metrics</h3>
            <p className="text-[10px] text-gray-500">Real-time system monitoring</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full animate-neon-pulse"
            style={{ backgroundColor: statusColor, boxShadow: `0 0 8px ${statusColor}80` }}
          />
          <span
            className="text-xs font-mono font-bold"
            style={{ color: statusColor, textShadow: `0 0 6px ${statusColor}40` }}
          >
            {statusLabel}
          </span>
          <span className="text-[10px] text-gray-600 ml-2">
            avg {Math.round(avgLoad)}%
          </span>
        </div>
      </div>

      {/* Metric cards grid */}
      <div className="grid grid-cols-3 gap-3">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>
    </div>
  )
}
