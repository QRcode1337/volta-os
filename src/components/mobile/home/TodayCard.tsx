'use client';
// Date/time + what's next. Clock/week helpers are the CalendarWidget ones (time.ts / left-time.ts); the calendar row
// is its WhatsNext source status (/api/sources, no fake events); "Up next" is the soonest scheduled routine.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CalendarDays, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/cn';
import { dayLabel } from '@/components/ltm/ltm-client';
import { useNow } from '@/components/dashboard/widgets/hooks';
import { useMemorySources } from '@/components/dashboard/widgets/left-sources';
import { StatusDot } from '@/components/dashboard/widgets/left-ui';
import { cityFromTimeZone, localTimeZone, tzAbbrev, ymdString } from '@/components/dashboard/widgets/left-time';
import { clock12, isoWeek, zonedYmd } from '@/components/dashboard/widgets/time';
import { localHHMM, relativeUntil } from '@/components/dashboard/widgets/right-hooks';
import { ROUTINES_HREF, useRoutinesView } from './data';
import { MCard, Skel } from './parts';

export function TodayCard() {
  const [tz, setTz] = useState<string | null>(null);
  useEffect(() => setTz(localTimeZone()), []);
  const now = useNow(30_000);
  const { sources, error: srcError, loading: srcLoading } = useMemorySources();
  const { upcoming, now: routineNow, loading: routinesLoading, routines } = useRoutinesView();

  const ready = !!now && !!tz;
  const ymd = ready ? zonedYmd(now, tz) : null;
  const clock = ready ? clock12(now, tz) : null;
  const dl = ymd ? dayLabel(ymdString(ymd.y, ymd.m, ymd.d)) : null;
  const zone = ready ? [tzAbbrev(now, tz), cityFromTimeZone(tz)].filter(Boolean).join(' · ') : '';

  const cal = sources?.find((s) => s.id === 'calendar') ?? null;
  const calDown = !cal || cal.status === 'not-connected' || cal.status === 'offline';
  const next = upcoming[0] ?? null;

  return (
    <MCard title="Today" icon={<CalendarDays size={14} strokeWidth={2.2} />} href="https://calendar.google.com" linkLabel="Calendar">
      {/* Clock + date */}
      <div className="flex items-end justify-between gap-3">
        {clock ? (
          <div className="flex items-baseline font-doto font-extrabold leading-none text-orange tabular-nums [text-shadow:0_0_22px_rgba(255,85,0,0.35)]">
            <span className="text-[44px]">{clock.hms.slice(0, 5)}</span>
            <span className="ml-1.5 text-[18px] font-bold">{clock.period}</span>
          </div>
        ) : (
          <Skel className="h-11 w-36" />
        )}
        <div className="min-w-0 text-right">
          {dl && ymd ? (
            <>
              <div className="text-[15px] font-semibold leading-tight text-paper">
                {dl.dow} {dl.label}
              </div>
              <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                W{isoWeek(ymd.y, ymd.m, ymd.d)} · {zone}
              </div>
            </>
          ) : (
            <Skel className="ml-auto h-8 w-24" />
          )}
        </div>
      </div>

      {/* Up next: soonest scheduled routine */}
      <div className="mt-3 border-t border-subtle pt-1">
        <div className="hud-label py-1">Up next</div>
        {routinesLoading && !routines ? (
          <Skel className="my-2 h-6 w-full" />
        ) : next && routineNow ? (
          <Link href={ROUTINES_HREF} className="flex min-h-11 items-center gap-3 rounded-lg active:bg-panel-hover/60">
            <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-orange px-2.5 font-mono text-[11.5px] font-semibold tabular-nums text-obsidian shadow-[0_0_10px_rgba(255,85,0,0.4)]">
              {localHHMM(next.at)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium leading-tight text-paper">{next.r.name}</span>
              <span
                className={cn(
                  'block font-mono text-[10px] leading-[14px] tabular-nums',
                  relativeUntil(next.at, routineNow.getTime()).includes('overdue') ? 'text-amber' : 'text-muted',
                )}
              >
                {relativeUntil(next.at, routineNow.getTime())} · {next.r.source}
              </span>
            </span>
          </Link>
        ) : (
          <p className="py-2.5 text-[12.5px] leading-snug text-secondary">
            {routines ? 'No upcoming scheduled routines.' : 'Routine schedule unavailable.'}
          </p>
        )}

        {/* Calendar source status (no events are fetched yet) */}
        {!sources && srcLoading ? (
          <Skel className="my-2 h-6 w-full" />
        ) : (
          <div
            className={cn('flex min-h-10 items-center gap-2 rounded-lg border px-2.5', calDown ? 'border-dashed border-subtle' : 'border-subtle bg-obsidian/60')}
            title={cal ? [cal.name, cal.headline, cal.detail, cal.setupHint].filter(Boolean).join(' · ') : (srcError ?? undefined)}
          >
            {cal ? <StatusDot status={cal.status} /> : <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-[#EF4444]" />}
            <span className="min-w-0 flex-1 truncate text-[12px] text-secondary">
              {cal
                ? calDown
                  ? `${cal.name} ${cal.status === 'offline' ? 'offline' : 'not connected'}`
                  : `${cal.name} · ${cal.headline}`
                : srcError
                  ? 'Sources offline · calendar status unknown'
                  : 'No calendar source reported'}
            </span>
            {cal?.href && cal.external && <ExternalLink size={13} aria-hidden className="shrink-0 text-muted" />}
          </div>
        )}
      </div>
    </MCard>
  );
}
