'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastTone = 'info' | 'success' | 'warn' | 'error';

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Optional link, e.g. { href: '/apps/editor', label: 'Open VOLTA Editor' }. */
  action?: { href: string; label: string };
  /** Auto-dismiss after ms. 0 = sticky. Default 4200 (errors 7000). */
  durationMs?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

export const TOAST_EVENT = 'rubric:toast';

/**
 * Fire a toast from anywhere on the client. Rendered by a mounted <Toaster /> (no provider needed).
 * Safe to call during SSR (no-op).
 */
export function toast(input: ToastInput): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ToastInput>(TOAST_EVENT, { detail: input }));
}

export function useToast() {
  return { toast };
}

const TONE: Record<ToastTone, { color: string; Icon: typeof Info }> = {
  info: { color: '#A39E93', Icon: Info },
  success: { color: '#22C55E', Icon: CheckCircle2 },
  warn: { color: '#F5A623', Icon: AlertTriangle },
  error: { color: '#EF4444', Icon: XCircle },
};

const MAX_VISIBLE = 4;

/** Bottom-right toast stack. Mount once per page (it sits above the 46px UsageRoboBar reserve). */
export function Toaster({ className }: { className?: string }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  useEffect(() => {
    const timerMap = timers.current;
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastInput>).detail;
      if (!detail?.title) return;
      const id = nextId.current++;
      setItems((xs) => [...xs, { ...detail, id }].slice(-MAX_VISIBLE));
      const ms = detail.durationMs ?? (detail.tone === 'error' ? 7000 : 4200);
      if (ms > 0) timerMap.set(id, setTimeout(() => dismiss(id), ms));
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      timerMap.forEach(clearTimeout);
      timerMap.clear();
    };
  }, [dismiss]);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className={cn('pointer-events-none fixed bottom-14 right-4 z-[110] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2', className)}
    >
      {items.map((t) => {
        const { color, Icon } = TONE[t.tone ?? 'info'];
        return (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="hud-card pointer-events-auto flex items-start gap-2.5 bg-panel-elevated px-3 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
            style={{ borderColor: `${color}55` }}
          >
            <Icon size={15} className="mt-0.5 shrink-0" style={{ color }} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium leading-snug text-paper">{t.title}</div>
              {t.description && <div className="mt-0.5 text-[12px] leading-snug text-secondary">{t.description}</div>}
              {t.action && (
                <Link
                  href={t.action.href}
                  onClick={() => dismiss(t.id)}
                  className="mt-1.5 inline-flex font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-orange hover:brightness-110"
                >
                  {t.action.label} →
                </Link>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted outline-none hover:text-paper focus-visible:ring-2 focus-visible:ring-orange/50"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default Toaster;
