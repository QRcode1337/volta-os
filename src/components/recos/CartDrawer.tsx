'use client';
import { Copy, ShoppingCart, Trash2, X, Zap } from 'lucide-react';
import type { Reco } from '@/types/recos';
import { cn } from '@/lib/cn';
import { BucketIcon } from './BucketIcon';
import { BUCKET_COLORS, cartSummary } from './recos-lib';

export interface CartDrawerProps {
  open: boolean;
  items: Reco[];
  onClose: () => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onCopyPrompt: () => void;
  onExecute: () => void;
}

export function CartDrawer({ open, items, onClose, onRemove, onClear, onCopyPrompt, onExecute }: CartDrawerProps) {
  const sum = cartSummary(items);
  const empty = items.length === 0;

  return (
    <div className={cn('fixed inset-0 z-50', open ? 'pointer-events-auto' : 'pointer-events-none')} inert={!open}>
      <div onClick={onClose} className={cn('absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Fix cart"
        className={cn(
          'absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col border-l border-highlight bg-panel shadow-[-24px_0_60px_-20px_rgba(0,0,0,0.9)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-subtle px-5">
          <ShoppingCart size={16} className="text-orange" />
          <h2 className="text-[15px] font-semibold text-paper">Fix Cart</h2>
          <span className="rounded-full bg-panel-elevated px-2 py-0.5 font-mono text-[10px] text-secondary">
            {items.length} item{items.length === 1 ? '' : 's'}
          </span>
          {!empty && (
            <button type="button" onClick={onClear} className="ml-auto font-mono text-[10px] uppercase tracking-[0.08em] text-muted transition-colors hover:text-paper">
              Clear
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close cart" className={cn('flex h-8 w-8 items-center justify-center rounded-md text-secondary transition-colors hover:bg-panel-hover hover:text-paper', empty && 'ml-auto')}>
            <X size={16} />
          </button>
        </header>

        <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-subtle bg-panel-elevated">
                <ShoppingCart size={22} className="text-muted" />
              </span>
              <p className="text-[14px] font-medium text-paper">Your cart is empty</p>
              <p className="max-w-[260px] text-[12.5px] leading-relaxed text-muted">Add this week&apos;s recommendations, then copy one consolidated prompt for Claude Code.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((r) => (
                <li key={r.id} className="group flex items-start gap-3 rounded-lg border border-subtle bg-panel-elevated p-3 transition-colors hover:border-highlight">
                  <span className="mt-0.5 h-8 w-1 shrink-0 rounded-full" style={{ background: BUCKET_COLORS[r.bucket] }} />
                  <span className="mt-0.5 shrink-0">
                    <BucketIcon bucket={r.bucket} size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium leading-snug text-paper">{r.title}</p>
                    <p className="mt-1 font-mono text-[10px] text-secondary">
                      {r.bucket} · {r.severity} · {r.steps.length} step{r.steps.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <button type="button" onClick={() => onRemove(r.id)} aria-label={`Remove ${r.title}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel-hover hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="shrink-0 border-t border-subtle bg-panel-elevated/60 px-5 pb-5 pt-4">
          <dl className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-subtle bg-panel p-3">
              <dt className="hud-label !text-[9.5px]">Items</dt>
              <dd className="mt-1 font-doto text-[22px] font-bold leading-none text-paper">{items.length}</dd>
            </div>
            <div className="rounded-lg border border-subtle bg-panel p-3">
              <dt className="hud-label !text-[9.5px]">Priority</dt>
              <dd className="mt-1 font-doto text-[22px] font-bold leading-none text-orange">{sum.priority}</dd>
            </div>
            <div className="rounded-lg border border-subtle bg-panel p-3">
              <dt className="hud-label !text-[9.5px]">Commands</dt>
              <dd className="mt-1 font-doto text-[22px] font-bold leading-none text-amber">{sum.commands}</dd>
            </div>
          </dl>
          {sum.byBucket.length > 0 && <p className="mt-2 font-mono text-[10.5px] text-muted">{sum.byBucket.map((b) => `${b.count} ${b.bucket}`).join(' · ')}</p>}

          <div className="mt-4 flex flex-col gap-2">
            <button type="button" disabled={empty} onClick={onExecute} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-orange text-[13px] font-semibold text-obsidian transition-all hover:brightness-110 hover:shadow-[0_0_24px_rgba(255,85,0,0.4)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40">
              <Zap size={15} strokeWidth={2.5} /> Execute: build &amp; copy agent prompt
            </button>
            <button type="button" disabled={empty} onClick={onCopyPrompt} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-highlight bg-panel text-[13px] font-semibold text-paper transition-all hover:border-orange/60 hover:bg-panel-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40">
              <Copy size={14} /> Copy prompt only
            </button>
            <p className="text-center font-mono text-[9.5px] text-muted">Nothing is changed by this app. You paste the prompt into Claude Code.</p>
          </div>
        </footer>
      </aside>
    </div>
  );
}
