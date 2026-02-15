import { InputHTMLAttributes } from 'react'

interface CyberInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function CyberInput({
  label,
  error,
  className = '',
  ...props
}: CyberInputProps) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label className="font-['Fira_Code'] text-sm uppercase text-neon-cyan">
          {label}
        </label>
      )}
      <input
        className={`
          bg-bg-void border-2 border-neon-cyan
          px-4 py-2 font-['Fira_Sans']
          text-white placeholder-gray-500
          focus:outline-none focus:border-neon-pink
          focus:cyber-glow-pink
          transition-all duration-200
          ${error ? 'border-neon-red' : ''}
          ${className}
        `}
        {...props}
      />
      {error && (
        <span className="text-neon-red text-sm font-['Fira_Code']">
          {error}
        </span>
      )}
    </div>
  )
}
