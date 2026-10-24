'use client';
import { CircleCheck, Info, TriangleAlert, Undo2, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ToastItem {
  id: number;
  message: string;
  tone: 'success' | 'info' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}

const ICONS = { success: CircleCheck, info: Info, error: TriangleAlert } as const;
const TONE = { success: 'text-green', info: 'text-amber', error: 'text-red-400' } as const;

export function Toasts({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICONS[t.tone];
        return (
          <div
            key={t.id}
            role="status"
            className="recos-toast pointer-events-auto flex min-w-[280px] max-w-[460px] items-center gap-3 rounded-lg border border-highlight bg-panel-elevated px-3.5 py-2.5 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.9)]"
          >
            <Icon size={16} className={cn('shrink-0', TONE[t.tone])} />
            <p className="min-w-0 flex-1 text-[12.5px] text-paper">{t.message}</p>
            {t.actionLabel && t.onAction && (
              <button
                type="button"
                onClick={() => {
                  t.onAction?.();
                  onDismiss(t.id);
                }}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-orange/50 px-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-orange transition-colors hover:bg-orange/10"
              >
                <Undo2 size={12} /> {t.actionLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition-colors hover:text-paper"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
