'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Visible label; also used as the accessible name. */
  label?: string;
  /** Accessible name when there is no visible label. */
  ariaLabel?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** Track color when on. Defaults to /robo orange. */
  color?: string;
  className?: string;
}

/** /robo switch: orange track when on, obsidian knob. Keyboard: Space/Enter (native button). */
export function Toggle({ checked, onChange, label, ariaLabel, size = 'md', disabled, color = '#FF5500', className }: ToggleProps) {
  const id = useId();
  const dims = size === 'sm' ? { w: 28, h: 16, k: 12 } : { w: 34, h: 20, k: 14 };
  const pad = (dims.h - dims.k) / 2;
  return (
    <span className={cn('inline-flex items-center gap-2', disabled && 'opacity-50', className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label ? undefined : ariaLabel}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative shrink-0 rounded-full border outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-orange/50 focus-visible:ring-offset-1 focus-visible:ring-offset-obsidian disabled:cursor-not-allowed"
        style={{
          width: dims.w,
          height: dims.h,
          background: checked ? color : 'var(--bg-panel-elevated)',
          borderColor: checked ? color : 'var(--border-highlight)',
        }}
      >
        <span
          aria-hidden
          className="absolute top-1/2 rounded-full transition-[left,background-color] duration-150 ease-out"
          style={{
            width: dims.k,
            height: dims.k,
            marginTop: -dims.k / 2,
            left: checked ? dims.w - dims.k - pad - 1 : pad - 1,
            background: checked ? 'var(--bg-obsidian)' : 'var(--text-secondary)',
          }}
        />
      </button>
      {label && (
        <label htmlFor={id} className={cn('font-mono text-[11px] uppercase tracking-[0.06em] text-secondary', !disabled && 'cursor-pointer')}>
          {label}
        </label>
      )}
    </span>
  );
}

export default Toggle;
