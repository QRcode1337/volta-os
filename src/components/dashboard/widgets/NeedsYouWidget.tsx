'use client';
// Home NEEDS YOU panel (top of the right column): Systems attention, Tasks awaiting and Feeds needs-action, one
// row each, linking into the app. Data and tones come from useNeedsYou (shared with the phone NeedsYouCard).

import Link from 'next/link';
import { BellRing, RotateCw } from 'lucide-react';
import { HudPanel } from '@/components/robo-ui';
import { cn } from '@/lib/cn';
import { TONE_DOT, TONE_TEXT, useNeedsYou, type NeedsYouTone } from './needs-you';

const PILL: Record<NeedsYouTone, string> = {
  critical: 'border-[#EF4444]/40 bg-[#EF4444]/10 text-[#EF4444]',
  warn: 'border-amber/40 bg-amber/10 text-amber',
  hot: 'border-orange/50 bg-orange/10 text-orange',
  clear: 'border-green/40 bg-green/10 text-green',
  unknown: 'border-subtle bg-obsidian text-secondary',
};

export function NeedsYouWidget({ className }: { className?: string }) {
  const ny = useNeedsYou();
  const stale = ny.rows.find((r) => r.stale);

  return (
    <HudPanel
      title="NEEDS YOU"
      icon={<BellRing size={14} strokeWidth={2.2} />}
      headerExtra={
        !ny.loading && !ny.allFailed ? (
          <span
            title="Systems alerts + Tasks awaiting + Feeds needing action"
            className={cn('whitespace-nowrap rounded-full border px-1.5 font-mono text-[9px] font-semibold tabular-nums', PILL[ny.allClear ? 'clear' : ny.tone])}
          >
            {ny.allClear ? 'ALL CLEAR' : ny.total}
          </span>
        ) : undefined
      }
      className={className}
      bodyClassName="flex flex-col px-3 py-1"
    >
      {ny.allFailed ? (
        <div className="flex flex-col items-start gap-1.5 py-1.5">
          <span className="hud-label text-[10px] text-amber">NEEDS-YOU SOURCES UNAVAILABLE</span>
          <p className="selectable line-clamp-2 text-[11.5px] leading-snug text-secondary">{ny.rows[0].detail}</p>
          <button
            type="button"
            onClick={ny.reload}
            className="inline-flex h-6 items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-highlight hover:text-paper"
          >
            <RotateCw size={10} className={cn(ny.refreshing && 'robo-spin')} /> RETRY
          </button>
        </div>
      ) : (
        <ul aria-busy={ny.loading || undefined}>
          {ny.rows.map((r) => (
            <li key={r.id} className="border-t border-subtle first:border-t-0">
              <Link
                href={r.href}
                title={r.tip}
                className="grid grid-cols-[8px_64px_minmax(0,1fr)_auto] items-center gap-2 py-[6px] transition-colors hover:bg-panel-hover/60"
              >
                <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[r.tone])} />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">{r.label}</span>
                {r.loading ? (
                  <span aria-hidden className="h-2.5 w-4/5 animate-pulse rounded bg-panel-elevated" />
                ) : (
                  <span className={cn('truncate text-[11.5px] leading-[15px]', r.failed ? 'text-[#EF4444]' : r.count ? 'text-paper/85' : 'text-muted')}>
                    {r.detail}
                  </span>
                )}
                <span className={cn('min-w-[22px] text-right font-mono text-[13px] font-semibold tabular-nums', r.count ? TONE_TEXT[r.tone] : 'text-muted')}>
                  {r.count ?? (r.loading ? '…' : '?')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {stale && (
        <p className="shrink-0 font-mono text-[9px] leading-[14px] text-amber" title={`${stale.label}: refresh failed`}>
          refresh failed · showing last data
        </p>
      )}
    </HudPanel>
  );
}

export default NeedsYouWidget;
