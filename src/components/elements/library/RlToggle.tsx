'use client';
import { useState } from 'react';

export interface RlToggleProps {
  label: string;
  hint?: string;
  defaultOn?: boolean;
  onChange?: (on: boolean) => void;
}

/** Glowing-green RL pill switch (e.g. "Teach my /cut"). */
export function RlToggle({ label, hint, defaultOn = false, onChange }: RlToggleProps) {
  const [on, setOn] = useState(defaultOn);
  const toggle = () => {
    setOn(!on);
    onChange?.(!on);
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={hint}
      onClick={toggle}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        height: 34,
        padding: '0 14px 0 6px',
        borderRadius: 999,
        cursor: 'pointer',
        border: `1px solid ${on ? 'rgba(34,197,94,0.55)' : '#262522'}`,
        background: on ? 'rgba(34,197,94,0.08)' : '#1C1B19',
        boxShadow: on ? '0 0 18px rgba(34,197,94,0.28), inset 0 0 12px rgba(34,197,94,0.08)' : 'none',
        color: on ? '#F5F2EB' : '#A39E93',
        font: '600 11px/1 "JetBrains Mono", monospace',
        letterSpacing: '0.04em',
        transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'relative',
          width: 36,
          height: 22,
          borderRadius: 999,
          background: on ? '#22C55E' : '#3A3834',
          transition: 'background 200ms',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: on ? 17 : 3,
            width: 16,
            height: 16,
            borderRadius: 999,
            background: '#F5F2EB',
            boxShadow: on ? '0 0 10px rgba(34,197,94,0.95)' : 'none',
            transition: 'left 200ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      </span>
      {label}
    </button>
  );
}
