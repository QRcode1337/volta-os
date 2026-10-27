'use client';
// Routines: swipeable row of the next scheduled jobs. Data: /api/routines via the shared store (RoutinesWidget's
// request); health is the server's single verdict (RealRoutine.health).

import Link from 'next/link';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { errorText, localHHMM, relativeUntil } from '@/components/dashboard/widgets/right-hooks';
import { ROUTINES_HREF, useRoutinesView } from './data';
import { Chip, MCard, OfflineNote, Skel, StaleNote } from './parts';

const MAX_CHIPS = 6;

export function RoutinesCard() {
  const { upcoming, stalled, failing, routines, now, error, loading, refreshing, reload } = useRoutinesView();
  const shown = upcoming.slice(0, MAX_CHIPS);

  let body;
  if (!routines && (loading || !error)) {
    body = (
      <div aria-label="Loading routines" className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <Skel key={i} className="h-[76px] w-[148px] shrink-0 rounded-lg" />
        ))}
      </div>
    );
  } else if (!routines) {
    body = <OfflineNote label="Routines offline" message={errorText(error)} onRetry={() => void reload()} busy={refreshing} />;
  } else if (!now) {
    body = <Skel className="h-[76px] w-full rounded-lg" />;
  } else if (shown.length === 0) {
    body = (
      <p className="text-[12.5px] leading-snug text-secondary">
        {stalled.length > 0
          ? `No upcoming runs: ${stalled.length} job${stalled.length === 1 ? ' is' : 's are'} over 1h overdue. Check the OpenClaw gateway.`
          : `No upcoming scheduled jobs. ${routines.length} routine${routines.length === 1 ? '' : 's'} found (interval and on-demand jobs have no next-run time).`}
      </p>
    );
  } else {
    body = (
      <>
        {/* Horizontal swipe row only; the page itself is the single vertical scroller. */}
        <ul className="-mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {shown.map(({ r, at }, i) => {
            const next = i === 0;
            const bad = r.health === 'failing';
            const skip = r.health === 'skipped';
            const when = relativeUntil(at, now.getTime());
            return (
              <li key={r.id} className="w-[148px] shrink-0 snap-start">
                <Link
                  href={ROUTINES_HREF}
                  className={cn(
                    'flex min-h-[76px] flex-col justify-between gap-1.5 rounded-lg border p-2.5 active:bg-panel-hover/60',
                    bad ? 'border-[#EF4444]/50 bg-[#EF4444]/[0.06]' : next ? 'border-orange/50 bg-orange/[0.05]' : 'border-subtle bg-obsidian/60',
                  )}
                >
                  <span className="flex items-center justify-between gap-1.5">
                    <span
                      className={cn(
                        'inline-flex h-5 items-center rounded-full px-2 font-mono text-[11px] font-semibold tabular-nums',
                        next ? 'bg-orange text-obsidian' : 'border border-subtle text-secondary',
                      )}
                    >
                      {localHHMM(at)}
                    </span>
                    <span
                      className={cn(
                        'font-mono text-[9.5px] font-semibold tracking-[0.08em]',
                        bad ? 'text-[#EF4444]' : skip ? 'text-amber' : next ? 'text-orange' : 'text-muted',
                      )}
                    >
                      {bad ? 'ERROR' : skip ? 'SKIP' : next ? 'NEXT' : 'QUEUED'}
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium leading-tight text-paper">{r.name}</span>
                    <span className={cn('block font-mono text-[10px] leading-[14px] tabular-nums', when.includes('overdue') ? 'text-amber' : 'text-muted')}>
                      {when} · {r.source}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {error && <StaleNote message={errorText(error)} />}
      </>
    );
  }

  return (
    <MCard
      title="Routines"
      icon={<Clock size={14} strokeWidth={2.2} />}
      href={ROUTINES_HREF}
      headerExtra={
        failing > 0 ? (
          <Chip tone="red">{failing} failing</Chip>
        ) : stalled.length > 0 ? (
          <Chip tone="amber">{stalled.length} stalled</Chip>
        ) : null
      }
    >
      {body}
    </MCard>
  );
}
