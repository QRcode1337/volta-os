'use client';
// Shared chrome for Generations + Carousels: top bar, toasts, modal shell, localStorage helpers.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { PixelMascotLogo } from '@/components/robo-ui';
import { cn } from '@/lib/cn';

// ───────────────────────── storage ─────────────────────────

export function loadJSON<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable — state stays in memory
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Deterministic UTC formatter ("Oct 22 · 18:40") — avoids locale/timezone hydration drift. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatStamp(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])} · ${m[4]}:${m[5]} UTC`;
}

// ───────────────────────── top bar ─────────────────────────

export function MediaTopBar({
  title,
  accent,
  subtitle,
  right,
}: {
  title: string;
  accent: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-subtle bg-panel/80 px-4 backdrop-blur">
      <Link
        href="/"
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-highlight hover:text-paper"
      >
        ← Back to VOLTA OS
      </Link>
      <div className="flex items-center gap-2.5">
        <PixelMascotLogo size={24} />
        <h1 className="text-[19px] font-bold leading-none tracking-tight text-paper">
          {title} <span className="font-doto text-orange">{accent}</span>
        </h1>
        {subtitle && <span className="hud-label hidden !text-muted md:inline">{subtitle}</span>}
      </div>
      <div className="ml-auto flex items-center gap-2">{right}</div>
    </header>
  );
}

// ───────────────────────── toasts ─────────────────────────

export interface Toast {
  id: number;
  message: string;
  tone?: 'ok' | 'error' | 'info';
  href?: string;
  hrefLabel?: string;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const push = useCallback((t: Omit<Toast, 'id'>, ms = 4200) => {
    const id = ++counter.current;
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), ms);
    return id;
  }, []);
  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((x) => x.id !== id)), []);
  return { toasts, push, dismiss };
}

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex w-[340px] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-[10px] border bg-panel-elevated px-3.5 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.55)]',
            t.tone === 'error' ? 'border-[#EF4444]/50' : t.tone === 'ok' ? 'border-orange/50' : 'border-highlight',
          )}
          style={{ animation: 'media-toast-in 220ms ease-out' }}
        >
          <span
            className={cn(
              'mt-1 h-2 w-2 shrink-0 rounded-full',
              t.tone === 'error' ? 'bg-[#EF4444]' : t.tone === 'ok' ? 'bg-orange' : 'bg-teal',
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-snug text-paper">{t.message}</p>
            {t.href && (
              <Link href={t.href} className="mt-1 inline-block font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-orange hover:underline">
                {t.hrefLabel ?? 'Open'} →
              </Link>
            )}
          </div>
          <button type="button" onClick={() => onDismiss(t.id)} className="text-muted hover:text-paper" aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── modal ─────────────────────────

export function Modal({
  open,
  onClose,
  children,
  className,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  label: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className={cn('hud-card relative max-h-full overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.7)]', className)}>
        {children}
      </div>
    </div>
  );
}

/** Keyframes used by both apps (globals.css is not ours to edit). */
export function MediaKeyframes() {
  return (
    <style>{`
      @keyframes media-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
      @keyframes media-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      @keyframes media-card-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
      .media-shimmer::after { content: ''; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 20%, rgba(255,85,0,0.16) 50%, transparent 80%); animation: media-shimmer 1.1s linear infinite; }
    `}</style>
  );
}
