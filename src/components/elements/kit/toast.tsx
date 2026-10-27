'use client';
// Minimal toast stack shared by Scripts + Elements (no external deps).
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ToastItem {
  id: number;
  message: string;
  tone?: 'default' | 'success' | 'error';
  href?: string;
  linkLabel?: string;
}

export function useToasts(ttlMs = 3200) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (message: string, opts: Omit<ToastItem, 'id' | 'message'> & { ttl?: number } = {}) => {
      const id = nextId.current++;
      const { ttl, ...rest } = opts;
      setToasts((t) => [...t.slice(-3), { id, message, ...rest }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ttl ?? (rest.href ? ttlMs * 2 : ttlMs)),
      );
    },
    [dismiss, ttlMs],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  return { toasts, push, dismiss };
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toast-stack pointer-events-none fixed bottom-5 right-5 z-[70] flex w-[360px] max-w-[calc(100vw-40px)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-panel-elevated px-3 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.55)]',
            t.tone === 'error' ? 'border-[#EF4444]/50' : t.tone === 'success' ? 'border-green/40' : 'border-highlight',
          )}
          style={{ animation: 'el-toast-in 180ms cubic-bezier(0.16,1,0.3,1)' }}
        >
          <span
            className={cn(
              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
              t.tone === 'error' ? 'bg-[#EF4444]/20 text-[#EF4444]' : 'bg-green/15 text-green',
            )}
          >
            {t.tone === 'error' ? <X className="h-2.5 w-2.5" /> : <Check className="h-2.5 w-2.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] leading-snug text-paper">{t.message}</p>
            {t.href && (
              <Link href={t.href} className="mt-1 inline-block font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-orange hover:underline">
                {t.linkLabel ?? 'Open'} →
              </Link>
            )}
          </div>
          <button type="button" onClick={() => onDismiss(t.id)} className="text-muted hover:text-paper" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <style>{`@keyframes el-toast-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
