interface StatusBadgeProps {
  status: 'active' | 'idle' | 'error' | 'warning'
  children: string
  pulse?: boolean
}

export function StatusBadge({ status, children, pulse = true }: StatusBadgeProps) {
  const statusConfig = {
    active: {
      color: 'text-neon-green',
      border: 'border-neon-green',
      dot: 'bg-neon-green',
      glow: 'cyber-glow-green',
    },
    idle: {
      color: 'text-neon-cyan',
      border: 'border-neon-cyan',
      dot: 'bg-neon-cyan',
      glow: 'cyber-glow-cyan',
    },
    error: {
      color: 'text-neon-red',
      border: 'border-neon-red',
      dot: 'bg-neon-red',
      glow: '',
    },
    warning: {
      color: 'text-neon-hot-pink',
      border: 'border-neon-hot-pink',
      dot: 'bg-neon-hot-pink',
      glow: 'cyber-glow-pink',
    },
  }

  const config = statusConfig[status]

  return (
    <div
      className={`
        inline-flex items-center gap-2 px-3 py-1
        border ${config.border} ${config.glow}
        font-['Fira_Code'] text-xs uppercase
        ${config.color}
      `}
    >
      <span
        className={`
          w-2 h-2 rounded-full ${config.dot}
          ${pulse ? 'animate-neon-pulse' : ''}
        `}
      />
      {children}
    </div>
  )
}
