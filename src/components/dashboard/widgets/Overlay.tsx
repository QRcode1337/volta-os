'use client';

import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useDismiss, useMounted } from './hooks';

interface HudModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  icon?: ReactNode;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Centered /robo modal rendered in a portal. Closes on backdrop click, Esc and OS_EVENTS.escape. */
export function HudModal({ open, onClose, title, icon, headerExtra, footer, className, children }: HudModalProps) {
  const mounted = useMounted();
  const panelRef = useRef<HTMLDivElement>(null);
  useDismiss(open, onClose, [panelRef]);
  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-6 backdrop-blur-[3px]">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          'hud-card flex max-h-[84vh] w-full max-w-[600px] flex-col overflow-hidden border-highlight shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,85,0,0.08)]',
          className,
        )}
        style={{ animation: 'rubric-modal-in 160ms ease-out' }}
      >
        <style>{`@keyframes rubric-modal-in{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}`}</style>
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-subtle bg-panel-elevated/60 px-4">
          {icon && <span className="flex h-4 w-4 items-center justify-center text-orange">{icon}</span>}
          <div className="hud-label min-w-0 truncate">{title}</div>
          {headerExtra}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted transition-colors hover:border-subtle hover:bg-panel-hover hover:text-paper"
          >
            <X size={14} />
          </button>
        </header>
        <div className="hud-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="flex shrink-0 items-center gap-2 border-t border-subtle px-4 py-2.5">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/** Tiny transient status line pinned to the bottom of a `relative` panel. */
export function PanelFlash({ message }: { message: string | null }) {
  return (
    <div
      aria-live="polite"
      className={cn(
        'pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-orange/40 bg-obsidian/95 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-paper shadow-[0_6px_24px_-6px_rgba(255,85,0,0.35)] transition-all duration-200',
        message ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
      )}
    >
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-orange align-middle" />
      {message}
    </div>
  );
}
