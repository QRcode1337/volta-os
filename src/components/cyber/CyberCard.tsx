import { ReactNode } from 'react'

interface CyberCardProps {
  children: ReactNode
  className?: string
  variant?: 'pink' | 'cyan' | 'green'
  glow?: boolean
  scanlines?: boolean
  holographic?: boolean
}

export function CyberCard({
  children,
  className = '',
  variant = 'cyan',
  glow = false,
  scanlines = false,
  holographic = false,
}: CyberCardProps) {
  const borderColors = {
    pink: 'border-neon-pink',
    cyan: 'border-neon-cyan',
    green: 'border-neon-green',
  }

  const glowClasses = {
    pink: 'cyber-glow-pink',
    cyan: 'cyber-glow-cyan',
    green: 'cyber-glow-green',
  }

  return (
    <div
      className={`
        relative bg-bg-layer-1 border-2 ${borderColors[variant]}
        ${glow ? glowClasses[variant] : ''}
        ${scanlines ? 'scanlines' : ''}
        ${holographic ? 'holographic' : ''}
        transition-all duration-200 hover:scale-[1.02]
        ${className}
      `}
    >
      <div className="clip-corner absolute top-0 right-0 w-4 h-4 bg-neon-cyan opacity-50" />
      {children}
    </div>
  )
}
