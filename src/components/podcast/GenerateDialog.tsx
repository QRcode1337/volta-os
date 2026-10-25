'use client';
import { useEffect, useState } from 'react';
import type { CostEstimate } from '@/lib/server/podcast/types';
import { cn } from '@/lib/cn';
import { fmtDay, fmtUsd } from './podcast-client';

export interface GenerateChoice {
  date: string;
  force: boolean;
  freshResearch: boolean;
}

/** Cost confirmation before anything is spent. Required (hard stop) when the max estimate is above the confirm threshold. */
export function GenerateDialog({ choice, estimate, busy, onCancel, onConfirm }: { choice: GenerateChoice | null; estimate: CostEstimate; busy: boolean; onCancel: () => void; onConfirm: (c: GenerateChoice) => void }) {
  const [fresh, setFresh] = useState(false);
  useEffect(() => setFresh(false), [choice?.date]);
  useEffect(() => {
    if (!choice) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choice, busy, onCancel]);
  if (!choice) return null;
  const row = 'flex items-baseline justify-between gap-4 border-b border-subtle/60 py-2 text-[12.5px]';
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div role="dialog" aria-label="Confirm episode generation" className="w-[min(480px,94vw)] rounded-xl border border-highlight bg-panel-elevated p-5 shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        <p className="hud-label !text-orange">{estimate.needsConfirm ? 'Confirm before spending' : choice.force ? 'Regenerate episode' : 'Generate episode'}</p>
        <p className="mt-3 flex items-baseline gap-2">
          <span className="font-mono text-4xl font-bold text-paper">{fmtUsd(estimate.usd)}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">est. audio · up to {fmtUsd(estimate.maxUsd)}</span>
        </p>
        <div className="mt-3">
          <div className={row}>
            <span className="text-muted">Episode</span>
            <span className="font-mono text-paper">{fmtDay(choice.date)}{choice.force ? ' (replaces existing)' : ''}</span>
          </div>
          <div className={row}>
            <span className="text-muted">Voice model</span>
            <span className="font-mono text-paper">{estimate.model}</span>
          </div>
          <div className={row}>
            <span className="text-muted">Length</span>
            <span className="font-mono text-paper">~{estimate.audioMinutes} min</span>
          </div>
          <div className={row}>
            <span className="text-muted">Estimate</span>
            <span className="max-w-[300px] text-right text-secondary">{estimate.breakdown}</span>
          </div>
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12.5px] text-secondary">
          <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} className="accent-[#FF5500]" />
          Re-run the web research (otherwise today&apos;s cached research is reused)
        </label>
        <p className="mt-3 text-[11.5px] leading-snug text-muted">Takes roughly 10 to 20 minutes: web research, script, voices and mastering. You can leave this page; it keeps running.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="h-9 rounded-full border border-subtle px-4 text-[12.5px] text-secondary hover:text-paper">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm({ ...choice, freshResearch: fresh })}
            className={cn('h-9 rounded-full bg-orange px-5 text-[12.5px] font-semibold text-obsidian', busy && 'opacity-60')}
          >
            {busy ? 'Starting' : estimate.needsConfirm ? `Spend up to ${fmtUsd(estimate.maxUsd)}` : choice.force ? 'Regenerate' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
