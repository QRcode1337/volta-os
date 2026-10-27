'use client';
// "Awaiting you": what in the OpenClaw action pipeline needs the user. Same endpoint and 60 s cadence as the
// desktop AwaitingBadge (/api/actions), read through the shared store; the full payload also carries the items.

import Link from 'next/link';
import { useMemo } from 'react';
import { ChevronRight, Hand } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSharedJson } from '@/components/dashboard/widgets/shared-json';
import { errorText } from '@/components/dashboard/widgets/right-hooks';
import { DEFAULT_STALE_DAYS, isStale, type ActionsResponse } from '@/components/tasks/types';
import { cleanActionText } from './data';
import { Chip, MCard, OfflineNote, Skel, StaleNote } from './parts';

const TASKS_HREF = '/apps/tasks';
const SHOWN = 3;

export function AwaitingCard() {
  const { data, error, loading, refreshing, reload } = useSharedJson<ActionsResponse>('/api/actions', 60_000);

  const unavailable = !!data && data.available === false;
  const counts = data?.counts?.byStatus;
  const awaiting = counts?.awaiting ?? 0;
  const items = useMemo(
    () =>
      (data?.items ?? [])
        .filter((i) => i.status === 'awaiting')
        .sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1))
        .slice(0, SHOWN),
    [data],
  );
  const hot = !!data && !unavailable && awaiting > 0;

  let body;
  if (!data && (loading || !error)) {
    body = (
      <div aria-label="Loading action pipeline" className="flex flex-col gap-2">
        <Skel className="h-9 w-24" />
        <Skel className="h-4 w-4/5" />
        <Skel className="h-4 w-3/5" />
      </div>
    );
  } else if (!data || unavailable) {
    body = (
      <OfflineNote
        label="Action pipeline offline"
        message={unavailable ? (data?.reason ?? 'actions.md could not be read') : errorText(error)}
        onRetry={() => void reload()}
        busy={refreshing}
      />
    );
  } else {
    body = (
      <>
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'font-doto text-[44px] font-extrabold leading-none tabular-nums',
                hot ? 'text-orange [text-shadow:0_0_20px_rgba(255,85,0,0.35)]' : 'text-paper',
              )}
            >
              {awaiting}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-secondary">{hot ? 'waiting on you' : 'all clear'}</span>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {(counts?.blocked ?? 0) > 0 && <Chip tone="red">{counts?.blocked} blocked</Chip>}
            {(counts?.progress ?? 0) > 0 && <Chip>{counts?.progress} in progress</Chip>}
          </div>
        </div>

        {items.length > 0 && (
          <ul className="mt-3 flex flex-col">
            {items.map((it) => {
              const stale = isStale(it, DEFAULT_STALE_DAYS);
              return (
                <li key={it.id} className="border-t border-subtle first:border-t-0">
                  <Link href={TASKS_HREF} className="flex min-h-11 items-center gap-2 py-2 active:bg-panel-hover/60">
                    <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />
                    <span className="min-w-0 flex-1 line-clamp-2 text-[13px] leading-snug text-paper">{cleanActionText(it.text)}</span>
                    {it.ageDays !== null && (
                      <span className={cn('shrink-0 font-mono text-[10px] tabular-nums', stale ? 'text-amber' : 'text-muted')}>{it.ageDays}d</span>
                    )}
                    <ChevronRight size={14} aria-hidden className="shrink-0 text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {!hot && <p className="mt-2 text-[12.5px] leading-snug text-secondary">Nothing in the action pipeline needs you right now.</p>}
        {error && <StaleNote message={errorText(error)} />}
      </>
    );
  }

  return (
    <MCard
      title="Awaiting you"
      icon={<Hand size={14} strokeWidth={2.2} />}
      href={TASKS_HREF}
      linkLabel="Open tasks"
      accent={hot}
    >
      {body}
    </MCard>
  );
}
