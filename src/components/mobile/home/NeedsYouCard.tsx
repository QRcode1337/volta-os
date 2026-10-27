'use client';
// "Needs you": Systems attention, Tasks awaiting and Feeds needs-action in one card at the top of the phone
// Today feed. Each row opens its app. Data and tones come from useNeedsYou (shared with the desktop panel).

import Link from 'next/link';
import { BellRing, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { TONE_DOT, TONE_TEXT, useNeedsYou } from '@/components/dashboard/widgets/needs-you';
import { Chip, MCard, OfflineNote, Skel, StaleNote } from './parts';

const CHIP_TONE = { critical: 'red', warn: 'amber', hot: 'orange', clear: 'green', unknown: 'muted' } as const;

export function NeedsYouCard() {
  const ny = useNeedsYou();
  const stale = ny.rows.find((r) => r.stale);

  let body;
  if (ny.loading) {
    body = (
      <div aria-label="Loading what needs you" className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex min-h-12 items-center gap-3">
            <Skel className="h-2 w-2 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skel className="h-3 w-16" />
              <Skel className="h-3 w-4/5" />
            </div>
            <Skel className="h-6 w-8" />
          </div>
        ))}
      </div>
    );
  } else if (ny.allFailed) {
    body = <OfflineNote label="Couldn't reach Systems, Tasks or Feeds" message={ny.rows[0].detail} onRetry={ny.reload} busy={ny.refreshing} />;
  } else {
    body = (
      <>
        {ny.allClear && <p className="pb-1 text-[12.5px] leading-snug text-secondary">All clear: nothing in Systems, Tasks or Feeds needs you.</p>}
        <ul className="flex flex-col">
          {ny.rows.map((r) => (
            <li key={r.id} className="border-t border-subtle first:border-t-0">
              <Link
                href={r.href}
                aria-label={`${r.label}: ${r.count === null ? r.detail : `${r.count} waiting · ${r.detail}`}`}
                className="flex min-h-12 items-center gap-3 py-2 outline-none active:bg-panel-hover/60 focus-visible:ring-2 focus-visible:ring-orange/50"
              >
                <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', TONE_DOT[r.tone])} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-secondary">{r.label}</span>
                  <span className={cn('truncate text-[13px] leading-snug', r.failed ? 'text-[#EF4444]' : r.count ? 'text-paper' : 'text-muted')}>
                    {r.detail}
                  </span>
                </span>
                <span
                  className={cn(
                    'shrink-0 font-doto text-[24px] font-extrabold leading-none tabular-nums',
                    r.count ? TONE_TEXT[r.tone] : 'text-muted',
                  )}
                >
                  {r.count ?? '–'}
                </span>
                <ChevronRight size={14} aria-hidden className="shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
        {stale && <StaleNote message={`${stale.label}: refresh failed`} />}
      </>
    );
  }

  return (
    <MCard
      title="Needs you"
      icon={<BellRing size={14} strokeWidth={2.2} />}
      headerExtra={
        !ny.loading && !ny.allFailed ? (
          ny.allClear ? (
            <Chip tone="green">All clear</Chip>
          ) : (
            <Chip tone={CHIP_TONE[ny.tone]} title="Systems alerts + Tasks awaiting + Feeds needing action">
              {ny.total}
            </Chip>
          )
        ) : undefined
      }
      accent={ny.tone === 'critical'}
    >
      {body}
    </MCard>
  );
}
