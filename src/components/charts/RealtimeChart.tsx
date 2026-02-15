import { useState, useEffect, useRef, useCallback } from 'react'
import Chart from 'react-apexcharts'
import type { ApexOptions } from 'apexcharts'

interface RealtimeChartProps {
  title?: string
  height?: number
  dataLabel?: string
  maxPoints?: number
  updateIntervalMs?: number
  dataSource?: () => number
  color?: 'cyan' | 'pink' | 'dual'
}

const COLOR_MAP = {
  cyan: {
    stroke: '#00FFFF',
    gradientFrom: 'rgba(0, 255, 255, 0.4)',
    gradientTo: 'rgba(0, 255, 255, 0.0)',
    glow: '0 0 12px rgba(0, 255, 255, 0.5)',
  },
  pink: {
    stroke: '#FF00FF',
    gradientFrom: 'rgba(255, 0, 255, 0.4)',
    gradientTo: 'rgba(255, 0, 255, 0.0)',
    glow: '0 0 12px rgba(255, 0, 255, 0.5)',
  },
}

function defaultDataSource(): number {
  return Math.floor(Math.random() * 80) + 20
}

export default function RealtimeChart({
  title = 'System Load',
  height = 280,
  dataLabel = 'Load %',
  maxPoints = 30,
  updateIntervalMs = 2000,
  dataSource = defaultDataSource,
  color = 'cyan',
}: RealtimeChartProps) {
  const [series, setSeries] = useState<{ name: string; data: { x: number; y: number }[] }[]>([
    { name: dataLabel, data: [] },
  ])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const addPoint = useCallback(() => {
    const now = Date.now()
    const value = dataSource()

    setSeries((prev) => {
      const existing = prev[0].data
      const updated = [...existing, { x: now, y: value }]
      if (updated.length > maxPoints) {
        updated.splice(0, updated.length - maxPoints)
      }
      return [{ ...prev[0], data: updated }]
    })
  }, [dataSource, maxPoints])

  useEffect(() => {
    // Seed with initial data
    const now = Date.now()
    const seed: { x: number; y: number }[] = []
    for (let i = maxPoints; i > 0; i--) {
      seed.push({ x: now - i * updateIntervalMs, y: dataSource() })
    }
    setSeries([{ name: dataLabel, data: seed }])

    intervalRef.current = setInterval(addPoint, updateIntervalMs)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [addPoint, dataLabel, dataSource, maxPoints, updateIntervalMs])

  const isDual = color === 'dual'
  const primary = isDual ? COLOR_MAP.cyan : COLOR_MAP[color]

  const options: ApexOptions = {
    chart: {
      type: 'area',
      background: 'transparent',
      animations: {
        enabled: true,
        dynamicAnimation: { speed: 800 },
      },
      toolbar: { show: false },
      zoom: { enabled: false },
      sparkline: { enabled: false },
      dropShadow: {
        enabled: true,
        top: 0,
        left: 0,
        blur: 8,
        opacity: 0.4,
        color: primary.stroke,
      },
    },
    colors: [primary.stroke],
    stroke: {
      curve: 'smooth',
      width: 2.5,
    },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.0,
        stops: [0, 100],
        colorStops: [
          { offset: 0, color: primary.stroke, opacity: 0.4 },
          { offset: 100, color: primary.stroke, opacity: 0.0 },
        ],
      },
    },
    grid: {
      borderColor: 'rgba(255, 0, 255, 0.08)',
      strokeDashArray: 3,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: true } },
      padding: { top: 0, right: 10, bottom: 0, left: 10 },
    },
    xaxis: {
      type: 'datetime',
      labels: {
        show: true,
        style: { colors: '#666', fontSize: '10px', fontFamily: 'monospace' },
        datetimeFormatter: { second: 'HH:mm:ss' },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: '#666', fontSize: '10px', fontFamily: 'monospace' },
        formatter: (val: number) => `${Math.round(val)}`,
      },
      min: 0,
    },
    tooltip: {
      enabled: true,
      theme: 'dark',
      style: { fontSize: '11px' },
      x: { format: 'HH:mm:ss' },
      marker: { show: true },
    },
    dataLabels: { enabled: false },
    legend: { show: false },
  }

  const currentValue = series[0]?.data[series[0].data.length - 1]?.y ?? 0

  return (
    <div className="bg-bg-void rounded-lg border border-neon-pink/10 p-4 relative overflow-hidden">
      {/* Scanline overlay */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.03]">
        <div className="w-full h-[200%] animate-scanline bg-gradient-to-b from-transparent via-neon-cyan/20 to-transparent" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full animate-neon-pulse"
            style={{ backgroundColor: primary.stroke, boxShadow: primary.glow }}
          />
          <h3 className="text-sm font-medium text-gray-200">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xl font-bold font-mono"
            style={{ color: primary.stroke, textShadow: primary.glow }}
          >
            {currentValue}
          </span>
          <span className="text-[10px] text-gray-500 uppercase">{dataLabel}</span>
        </div>
      </div>

      {/* Chart */}
      <div className="relative z-10">
        <Chart options={options} series={series} type="area" height={height} />
      </div>
    </div>
  )
}
