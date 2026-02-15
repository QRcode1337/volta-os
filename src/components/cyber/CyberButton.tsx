import { ReactNode, ButtonHTMLAttributes } from 'react'

interface CyberButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
  glitch?: boolean
}

export function CyberButton({
  children,
  variant = 'primary',
  glitch = false,
  className = '',
  ...props
}: CyberButtonProps) {
  const variants = {
    primary: 'bg-neon-pink border-neon-pink text-white cyber-glow-pink',
    secondary: 'bg-neon-cyan border-neon-cyan text-black cyber-glow-cyan',
    danger: 'bg-neon-red border-neon-red text-white',
  }

  return (
    <button
      className={`
        px-6 py-3 font-['Fira_Code'] font-bold uppercase
        border-2 clip-angle-left cursor-pointer
        transition-all duration-200
        hover:scale-105 active:scale-95
        ${glitch ? 'hover:animate-glitch' : ''}
        ${variants[variant]}
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  )
}
