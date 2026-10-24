'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { OS_EVENTS } from '@/lib/events';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Rendered next to the title (badges etc.). */
  headerExtra?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Close when the backdrop is clicked. Default true. */
  dismissible?: boolean;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

const WIDTH: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input:not([disabled]),select,[tabindex]:not([tabindex="-1"])';

/**
 * /robo modal: obsidian backdrop, hud-card dialog, portal to <body>.
 * Closes on Escape, on the OS-wide `rubric:escape` event, and on backdrop click. Traps Tab and restores focus.
 */
export function Modal({ open, onClose, title, headerExtra, footer, size = 'md', dismissible = true, className, bodyClassName, children }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialog)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    const onOsEscape = () => onCloseRef.current();

    window.addEventListener('keydown', onKey, true);
    window.addEventListener(OS_EVENTS.escape, onOsEscape);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener(OS_EVENTS.escape, onOsEscape);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-obsidian/75 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn('hud-card flex max-h-[min(85vh,900px)] w-full flex-col overflow-hidden shadow-[0_0_0_1px_var(--border-subtle),0_24px_80px_rgba(0,0,0,0.6)] outline-none', WIDTH[size], className)}
      >
        {(title || headerExtra) && (
          <header className="flex h-10 shrink-0 items-center gap-2 border-b border-subtle px-4">
            {title && <h2 className="hud-label min-w-0 truncate">{title}</h2>}
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted outline-none transition-colors hover:bg-panel-hover hover:text-paper focus-visible:ring-2 focus-visible:ring-orange/50"
            >
              <X size={14} />
            </button>
          </header>
        )}
        <div className={cn('hud-scroll min-h-0 flex-1 overflow-auto p-4', bodyClassName)}>{children}</div>
        {footer && <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-subtle px-4 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export default Modal;
