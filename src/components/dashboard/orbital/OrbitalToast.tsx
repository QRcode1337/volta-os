'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Info } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastTone = 'info' | 'success' | 'error';
export type ToastFn = (message: string, tone?: ToastTone) => void;

interface ToastEntry {
  id: number;
  message: string;
  tone: ToastTone;
}

const TONE_ICON = { info: Info, success: Check, error: AlertTriangle } as const;
const TONE_COLOR: Record<ToastTone, string> = { info: '#A39E93', success: '#22C55E', error: '#EF4444' };

/** Tiny local toast queue for the orbital core (portal → fixed top-center, above modals). */
export function useOrbitalToasts() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const tm = timers.current.get(id);
    if (tm) clearTimeout(tm);
    timers.current.delete(id);
  }, []);

  const toast = useCallback<ToastFn>(
    (message, tone = 'info') => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), 2800),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((tm) => clearTimeout(tm));
      map.clear();
    };
  }, []);

  return { toasts, toast, dismiss };
}

export function OrbitalToastViewport({ toasts, onDismiss }: { toasts: ToastEntry[]; onDismiss: (id: number) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="pointer-events-none fixed left-1/2 top-4 z-[90] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => {
        const Icon = TONE_ICON[t.tone];
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onDismiss(t.id)}
            className={cn(
              'orbital-toast pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border bg-panel-elevated/95 px-4 py-2',
              'font-mono text-[11px] tracking-[0.04em] text-paper shadow-[0_10px_40px_rgba(0,0,0,0.55)] backdrop-blur',
            )}
            style={{ borderColor: `${TONE_COLOR[t.tone]}55` }}
          >
            <Icon size={13} style={{ color: TONE_COLOR[t.tone] }} className="shrink-0" />
            <span className="truncate">{t.message}</span>
          </button>
        );
      })}
      <style>{`
        @keyframes orbital-toast-in { from { opacity: 0; transform: translateY(-8px) scale(0.97); } to { opacity: 1; transform: none; } }
        .orbital-toast { animation: orbital-toast-in 220ms cubic-bezier(.2,.8,.2,1) both; }
      `}</style>
    </div>,
    document.body,
  );
}
