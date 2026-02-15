import { type HTMLAttributes } from 'react'

type NeonColor = 'pink' | 'cyan' | 'green'

/* --------------------------------
   SkeletonCard
   Neon-pulsing placeholder card
   -------------------------------- */

interface SkeletonCardProps extends HTMLAttributes<HTMLDivElement> {
  lines?: number
  neonColor?: NeonColor
  showAvatar?: boolean
}

const skeletonNeonMap: Record<NeonColor, { border: string; bg: string; shimmer: string }> = {
  cyan: {
    border: 'rgba(0, 255, 255, 0.1)',
    bg: 'rgba(0, 255, 255, 0.05)',
    shimmer: 'rgba(0, 255, 255, 0.08)',
  },
  pink: {
    border: 'rgba(255, 0, 255, 0.1)',
    bg: 'rgba(255, 0, 255, 0.05)',
    shimmer: 'rgba(255, 0, 255, 0.08)',
  },
  green: {
    border: 'rgba(0, 255, 0, 0.1)',
    bg: 'rgba(0, 255, 0, 0.05)',
    shimmer: 'rgba(0, 255, 0, 0.08)',
  },
}

export function SkeletonCard({
  lines = 3,
  neonColor = 'cyan',
  showAvatar = false,
  className = '',
  ...props
}: SkeletonCardProps) {
  const colors = skeletonNeonMap[neonColor]

  return (
    <div
      className={`relative p-4 bg-bg-layer-1 ${className}`}
      style={{ border: `1px solid ${colors.border}` }}
      role="status"
      aria-label="Loading"
      {...props}
    >
      {showAvatar && (
        <div className="flex items-center gap-3 mb-4">
          <div
            className="cyber-skeleton rounded-full"
            style={{
              width: 36,
              height: 36,
              background: colors.bg,
              borderColor: colors.border,
            }}
          />
          <div
            className="cyber-skeleton rounded"
            style={{
              width: '40%',
              height: 12,
              background: colors.bg,
              borderColor: colors.border,
            }}
          />
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="cyber-skeleton rounded"
            style={{
              height: i === 0 ? 14 : 10,
              width: i === lines - 1 ? '60%' : '100%',
              background: colors.bg,
              borderColor: colors.border,
            }}
          />
        ))}
      </div>
      <span className="sr-only">Loading content...</span>
    </div>
  )
}

/* --------------------------------
   CyberSpinner
   Holographic dual-ring spinner
   -------------------------------- */

interface CyberSpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

const spinnerSizes: Record<string, { outer: number; inner: number; core: number; border: number }> = {
  sm: { outer: 24, inner: 16, core: 6, border: 2 },
  md: { outer: 40, inner: 28, core: 10, border: 2 },
  lg: { outer: 56, inner: 40, core: 14, border: 3 },
}

export function CyberSpinner({
  size = 'md',
  label,
  className = '',
  ...props
}: CyberSpinnerProps) {
  const s = spinnerSizes[size]

  return (
    <div
      className={`inline-flex flex-col items-center gap-3 ${className}`}
      role="status"
      aria-label={label || 'Loading'}
      {...props}
    >
      <div
        className="cyber-spinner"
        style={{ width: s.outer, height: s.outer }}
      >
        {/* Outer ring */}
        <div
          className="cyber-spinner-ring cyber-spinner-ring-outer"
          style={{
            width: s.outer,
            height: s.outer,
            borderWidth: s.border,
          }}
        />
        {/* Inner ring (counter-rotates) */}
        <div
          className="cyber-spinner-ring cyber-spinner-ring-inner"
          style={{
            width: s.inner,
            height: s.inner,
            borderWidth: s.border,
          }}
        />
        {/* Core glow */}
        <div
          className="cyber-spinner-core"
          style={{ width: s.core, height: s.core }}
        />
      </div>
      {label && (
        <span className="text-xs font-mono uppercase tracking-wider text-neon-cyan/70">
          {label}
        </span>
      )}
      <span className="sr-only">{label || 'Loading...'}</span>
    </div>
  )
}

/* --------------------------------
   CyberProgress
   Gradient animated progress bar
   -------------------------------- */

interface CyberProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number
  max?: number
  label?: string
  showValue?: boolean
  size?: 'sm' | 'md' | 'lg'
  neonColor?: NeonColor
}

const progressSizes: Record<string, number> = {
  sm: 4,
  md: 8,
  lg: 12,
}

export function CyberProgress({
  value,
  max = 100,
  label,
  showValue = false,
  size = 'md',
  className = '',
  ...props
}: CyberProgressProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100))
  const height = progressSizes[size]

  return (
    <div
      className={`flex flex-col gap-1.5 ${className}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      {...props}
    >
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs font-mono">
          {label && (
            <span className="uppercase tracking-wider text-gray-400">{label}</span>
          )}
          {showValue && (
            <span className="text-neon-cyan tabular-nums">{Math.round(percent)}%</span>
          )}
        </div>
      )}
      <div
        className="cyber-progress-track rounded-sm"
        style={{ height }}
      >
        <div
          className="cyber-progress-fill cyber-progress-scanline rounded-sm"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
