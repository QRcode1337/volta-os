'use client';
import { useEffect, useState } from 'react';
import type { Quote } from '@/types/media';
import { cn } from '@/lib/cn';
import { fmtUsd } from './gen-client';
import { Modal } from './ui';

/** Confirm-before-spend dialog: nothing is charged until "Spend" is pressed (POST /api/media/generate). */
export function GenConfirm({
  quote,
  prompt,
  busy,
  onCancel,
  onConfirm,
}: {
  quote: Quote | null;
  prompt: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!quote) return;
    const tick = () => setLeft(Math.max(0, Math.round((Date.parse(quote.expiresAt) - Date.now()) / 1000)));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [quote]);
  if (!quote) return null;
  const expired = left <= 0;
  const row = 'flex items-baseline justify-between gap-4 border-b border-subtle/60 py-2 text-[12.5px]';
  return (
    <Modal open onClose={busy ? () => {} : onCancel} label="Confirm generation" className="w-[min(480px,94vw)]">
      <div className="p-5">
        <p className="hud-label !text-orange">Confirm before spending</p>
        <p className="mt-3 flex items-baseline gap-2">
          <span className="font-mono text-4xl font-bold text-paper">{quote.estUsd === 0 ? '$0' : fmtUsd(quote.estUsd)}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">est. {quote.estUsd === 0 ? '(within free quota)' : ''}</span>
        </p>
        <div className="mt-3">
          <div className={row}>
            <span className="text-muted">Model</span>
            <span className="font-mono text-paper">
              {quote.model} <span className="text-muted">· {quote.provider}</span>
            </span>
          </div>
          <div className={row}>
            <span className="text-muted">Count</span>
            <span className="font-mono text-paper">{quote.count}</span>
          </div>
          <div className={row}>
            <span className="text-muted">Estimate</span>
            <span className="text-right text-secondary">{quote.breakdown}</span>
          </div>
          {quote.credits !== undefined && quote.creditsRemainingAfter !== undefined && (
            <div className={row}>
              <span className="text-muted">Quota after</span>
              <span className="font-mono text-paper">{quote.creditsRemainingAfter.toLocaleString()} credits</span>
            </div>
          )}
          <div className={row}>
            <span className="text-muted">Saves to</span>
            <span className="break-all text-right font-mono text-[11px] text-paper">{quote.outputDir}/</span>
          </div>
        </div>
        <p className="mt-3 line-clamp-3 rounded-md border border-subtle bg-obsidian p-2.5 text-[12px] leading-snug text-secondary">{prompt}</p>
        {quote.warnings.map((w) => (
          <p key={w} className="mt-2 font-mono text-[10.5px] text-amber">
            {w}
          </p>
        ))}
        <div className="mt-5 flex items-center gap-2">
          <span className={cn('font-mono text-[10px] uppercase tracking-[0.05em]', expired ? 'text-[#EF4444]' : 'text-muted')}>
            {expired ? 'Estimate expired' : `Valid ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
          </span>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="ml-auto h-9 rounded-md border border-subtle px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-secondary hover:border-highlight hover:text-paper disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || expired}
            className="h-9 rounded-md border border-orange bg-orange px-4 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-obsidian hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Starting...' : quote.estUsd === 0 ? 'Generate' : `Spend ~${fmtUsd(quote.estUsd)} & generate`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
