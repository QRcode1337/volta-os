'use client';
import type { CSSProperties } from 'react';
import { Check, CircleCheck, Flame, RotateCcw, ShoppingCart, X } from 'lucide-react';
import type { RecommendationCardExt } from '@/types/os';
import { cn } from '@/lib/cn';
import { BucketIcon } from './BucketIcon';
import { BUCKET_COLORS, type RecoStatus } from './recos-lib';

export interface RecoCardProps {
  reco: RecommendationCardExt;
  status: RecoStatus;
  onToggleCart: () => void;
  onDone: () => void;
  onSkip: () => void;
  onRestore: () => void;
}

export function RecoCard({ reco, status, onToggleCart, onDone, onSkip, onRestore }: RecoCardProps) {
  const color = BUCKET_COLORS[reco.bucket];
  const inCart = status === 'in_cart';
  const closed = status === 'done' || status === 'skipped';
  const style = { '--bucket': color } as CSSProperties;

  return (
    <article
      style={style}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-[10px] border bg-panel transition-all duration-200 ease-out',
        'hover:-translate-y-1 hover:bg-panel-elevated hover:shadow-[0_14px_34px_-18px_var(--bucket)]',
        inCart ? 'border-orange/70 shadow-[0_0_0_1px_rgba(255,85,0,0.25)]' : 'border-subtle hover:border-highlight',
        closed && 'opacity-55 hover:opacity-90',
      )}
    >
      <div className="h-1 w-full shrink-0" style={{ background: color }} />

      <div className="flex flex-1 flex-col gap-3.5 p-4">
        {/* Header */}
        <header className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-transform duration-200 group-hover:scale-105"
            style={{ background: `${color}14`, borderColor: `${color}40` }}
          >
            <BucketIcon bucket={reco.bucket} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold leading-snug text-paper">{reco.title}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex h-5 items-center rounded-full border px-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em]"
                style={{ color, borderColor: `${color}55`, background: `${color}12` }}
              >
                {reco.bucket}
              </span>
              {reco.priority && (
                <span className="inline-flex h-5 items-center gap-1 rounded-full border border-orange/50 bg-orange/10 px-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-orange">
                  <Flame size={10} strokeWidth={2.5} /> Priority
                </span>
              )}
              {status === 'done' && (
                <span className="inline-flex h-5 items-center gap-1 rounded-full border border-green/50 bg-green/10 px-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-green">
                  <CircleCheck size={10} strokeWidth={2.5} /> Done
                </span>
              )}
              {status === 'skipped' && (
                <span className="inline-flex h-5 items-center rounded-full border border-subtle px-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Skipped
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Benefit */}
        <section className="rounded-lg border border-subtle bg-obsidian/60 p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="hud-label !text-[10px]">What&apos;s the benefit</span>
            <span
              className="inline-flex h-5 shrink-0 items-center rounded-md px-1.5 font-mono text-[10px] font-semibold"
              style={{ color, background: `${color}1A` }}
            >
              {reco.savingsLabel}
            </span>
          </div>
          <p className="text-[12.5px] leading-relaxed text-secondary">{reco.benefit}</p>
        </section>

        {/* Action */}
        <section>
          <span className="hud-label !text-[10px]">What I can do</span>
          <p className="mt-1 text-[12.5px] leading-relaxed text-paper/85">{reco.actionDescription}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {reco.filesTouched.map((f) => (
              <code
                key={f}
                className="rounded border border-subtle bg-panel-elevated px-1.5 py-0.5 font-mono text-[10px] text-secondary transition-colors group-hover:border-highlight"
              >
                {f}
              </code>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-auto flex items-center gap-2 border-t border-subtle pt-3">
          <span className="mr-auto font-mono text-[10px] uppercase tracking-[0.06em] text-muted">{reco.effortLabel}</span>
          {closed ? (
            <button
              type="button"
              onClick={onRestore}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-subtle px-3 text-[12px] font-medium text-secondary transition-colors hover:border-highlight hover:text-paper"
            >
              <RotateCcw size={13} /> Restore
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onSkip}
                title="Skip this week"
                className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-muted transition-colors hover:bg-panel-hover hover:text-paper"
              >
                <X size={13} /> Skip
              </button>
              <button
                type="button"
                onClick={onDone}
                title="Mark as already done"
                className="inline-flex h-8 items-center gap-1 rounded-md border border-subtle px-2.5 text-[12px] font-medium text-secondary transition-colors hover:border-green/60 hover:text-green"
              >
                <Check size={13} /> Done
              </button>
              <button
                type="button"
                onClick={onToggleCart}
                aria-pressed={inCart}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-all duration-150 active:scale-95',
                  inCart
                    ? 'border border-green/60 bg-green/10 text-green hover:bg-green/15'
                    : 'bg-orange text-obsidian hover:brightness-110 hover:shadow-[0_0_18px_rgba(255,85,0,0.35)]',
                )}
              >
                {inCart ? (
                  <span>✓ In Cart</span>
                ) : (
                  <>
                    <ShoppingCart size={13} strokeWidth={2.5} /> Add to cart
                  </>
                )}
              </button>
            </>
          )}
        </footer>
      </div>
    </article>
  );
}
