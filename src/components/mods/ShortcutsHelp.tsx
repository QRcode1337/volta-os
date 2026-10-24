'use client';

import { useEffect, useRef } from 'react';
import { Keyboard, X } from 'lucide-react';
import { PixelMascotLogo } from '@/components/robo-ui';

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['⌘', 'K'], label: 'Search every memory source (Ctrl+K)' },
  { keys: ['/'], label: 'Focus SEARCH ARTIFACTS' },
  { keys: ['Esc'], label: 'Close modals, drawers & popovers' },
  { keys: ['?'], label: 'Toggle this shortcuts panel' },
];

export interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

/** Small keyboard-shortcuts overlay opened with "?" from the home shell. */
export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rubric-shortcuts-title"
        onClick={(e) => e.stopPropagation()}
        className="hud-card w-full max-w-sm p-4 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
      >
        <header className="mb-3 flex items-center gap-2">
          <PixelMascotLogo size={16} />
          <Keyboard size={14} className="text-orange" />
          <h2 id="rubric-shortcuts-title" className="hud-label">
            Keyboard Shortcuts
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-hover hover:text-paper"
          >
            <X size={13} />
          </button>
        </header>
        <ul className="flex flex-col gap-1.5">
          {SHORTCUTS.map((s) => (
            <li
              key={s.label}
              className="flex items-center justify-between gap-3 rounded-lg border border-subtle bg-panel-elevated px-3 py-2"
            >
              <span className="text-[13px] text-paper">{s.label}</span>
              <span className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="min-w-[24px] rounded-md border border-highlight bg-panel-hover px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold text-orange"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 font-mono text-[10px] text-muted">⌘K works everywhere, even in a text field; the others are ignored while typing.</p>
      </div>
    </div>
  );
}

export default ShortcutsHelp;
