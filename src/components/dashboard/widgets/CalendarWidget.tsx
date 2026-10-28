'use client';

import { memo, useEffect, useState, type ReactNode } from 'react';
import { CalendarDays } from 'lucide-react';
import { HudPanel } from '@/components/robo-ui';
import { dayLabel } from '@/components/ltm/ltm-client';
import { cn } from '@/lib/cn';
import { useNow } from './hooks';
import { clock12, clock24, isoWeek, weekPill, zonedYmd } from './time';
import { cityFromTimeZone, dayDiff, localTimeZone, tzAbbrev, ymdString } from './left-time';
import { ActivityHeatmap } from './ActivityHeatmap';
import { useMemorySources } from './left-sources';
import { CopyHintButton, StatusDot } from './left-ui';

const WORLD_CLOCKS = [
  { label: 'USA PT', timeZone: 'America/Los_Angeles' },
  { label: 'LONDON', timeZone: 'Europe/London' },
  { label: 'UTC', timeZone: 'UTC' },
] as const;
/** Used in place of a world clock that would duplicate the local (primary) zone. */
const SWAP_CLOCK = { label: 'USA ET', timeZone: 'America/New_York' } as const;

/** Short viewports (≤760px tall): drop the world-clock row so the panel stays ~200px of body. */
const COMPACT_HIDE = '[@media(max-height:760px)]:hidden';

/**
 * Home left-column middle panel (content-height, ~250px of body at 1280px wide):
 * live local clock + week, world clocks, real LTM activity heatmap, calendar-source status.
 * Only <LiveClock> re-renders every second; the rest updates on the minute tick / its own polls.
 */
export function CalendarWidget({ className }: { className?: string }) {
  const [tz, setTz] = useState<string | null>(null);
  useEffect(() => setTz(localTimeZone()), []);
  const minute = useNow(60_000);

  const ymd = minute && tz ? zonedYmd(minute, tz) : null;
  const today = ymd ? ymdString(ymd.y, ymd.m, ymd.d) : null;

  return (
    <HudPanel
      title="CALENDAR"
      icon={<CalendarDays size={14} strokeWidth={2.2} />}
      actions={[{ label: 'OPEN CAL', href: 'https://calendar.google.com' }]}
      className={className}
      bodyClassName="flex flex-col gap-2 px-3 py-2"
    >
      <LiveClock tz={tz} />

      {/* Real LTM activity (14 days × 6-hour blocks) */}
      <ActivityHeatmap today={today} />

      {/* What's next — calendar source status (no fake events) */}
      <WhatsNext />
    </HudPanel>
  );
}

/** Ticking clock hero (browser-local zone) + week/date line + world clocks. */
function LiveClock({ tz }: { tz: string | null }) {
  const now = useNow();

  const ymd = now && tz ? zonedYmd(now, tz) : null;
  const today = ymd ? ymdString(ymd.y, ymd.m, ymd.d) : null;
  const main = now && tz ? clock12(now, tz) : { hms: '--:--:--', period: '--' };
  const abbr = now && tz ? tzAbbrev(now, tz) : '';
  const zoneLabel = tz ? [abbr, cityFromTimeZone(tz)].filter(Boolean).join(' · ') : 'LOCAL TIME';
  const dl = today ? dayLabel(today) : null;
  const week = ymd && dl ? `W${isoWeek(ymd.y, ymd.m, ymd.d)} · ${dl.dow} ${dl.label}` : 'W-- · --- --- --';
  const clocks = WORLD_CLOCKS.map((c) => (c.timeZone === tz ? SWAP_CLOCK : c));

  return (
    <>
      <div className="flex flex-col items-center">
        <div
          className="flex items-baseline font-doto font-extrabold leading-none text-orange tabular-nums [text-shadow:0_0_22px_rgba(255,85,0,0.35)]"
          style={{ fontSize: 'clamp(26px, 2.5vw, 44px)' }}
          aria-live="off"
        >
          <span>{main.hms}</span>
          <span className="ml-2 text-[0.42em] font-bold">{main.period}</span>
        </div>
        <div className="mt-1 flex max-w-full items-center gap-1.5 text-[10px] leading-[14px]">
          <span className="hud-label min-w-0 truncate" title={tz ?? undefined}>
            {zoneLabel}
          </span>
          <span aria-hidden className="shrink-0 text-muted/50">
            ·
          </span>
          <span
            className="hud-label inline-flex shrink-0 items-center gap-1"
            title={ymd ? weekPill(ymd.y, ymd.m, ymd.d) : undefined}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-orange robo-pulse" />
            {week}
          </span>
        </div>
      </div>

      <div className={cn('grid grid-cols-3 divide-x divide-subtle rounded-lg border border-subtle bg-obsidian/60', COMPACT_HIDE)}>
        {clocks.map((c) => {
          const offset = now && today ? dayDiff(today, ymdOf(now, c.timeZone)) : 0;
          return (
            <div key={c.label} className="flex flex-col items-center py-1" title={c.timeZone}>
              <span className="font-mono text-[8.5px] font-semibold uppercase leading-[11px] tracking-[0.1em] text-muted">{c.label}</span>
              <span className="font-mono text-[12.5px] font-semibold leading-4 tabular-nums text-paper">
                {now ? clock24(now, c.timeZone) : '--:--'}
                {offset !== 0 && (
                  <sup className="ml-0.5 text-[8px] font-medium text-muted">{offset > 0 ? `+${offset}` : offset}</sup>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ymdOf(d: Date, timeZone: string): string {
  const p = zonedYmd(d, timeZone);
  return ymdString(p.y, p.m, p.d);
}

const NEXT_ROW = 'flex h-[26px] items-center gap-1.5 rounded-lg border px-1.5';

/** One-line "what's next": calendar source status from /api/sources (setup hint in tooltip + copy button). */
const WhatsNext = memo(function WhatsNext() {
  const { sources, error, loading } = useMemorySources();
  const cal = sources?.find((s) => s.id === 'calendar') ?? null;
  // Not .hud-label: that class is unlayered CSS and would override these size/tracking utilities.
  const label = (
    <span className="shrink-0 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-secondary">WHAT&apos;S NEXT</span>
  );

  let row: ReactNode;
  if (!sources && loading) {
    row = (
      <div className={cn(NEXT_ROW, 'border-dashed border-subtle')} aria-label="Loading calendar status">
        {label}
        <span className="h-[7px] w-[7px] shrink-0 animate-pulse rounded-full bg-subtle" />
        <span className="h-2 flex-1 animate-pulse rounded bg-subtle/70" />
      </div>
    );
  } else if (!cal) {
    row = (
      <div className={cn(NEXT_ROW, 'border-dashed border-subtle')} title={error ?? undefined}>
        {label}
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted">
          {error ? 'Sources API unreachable — status unknown' : 'No calendar source reported'}
        </span>
      </div>
    );
  } else {
    const disconnected = cal.status === 'not-connected' || cal.status === 'offline';
    const tooltip = [cal.name, cal.headline, cal.detail, cal.setupHint].filter(Boolean).join(' · ');
    row = (
      <div
        className={cn(NEXT_ROW, disconnected ? 'border-dashed border-subtle bg-obsidian/40' : 'border-subtle bg-obsidian/60')}
        title={tooltip}
      >
        {label}
        <StatusDot status={cal.status} />
        <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-secondary">
          {disconnected ? `${cal.name} ${cal.status === 'offline' ? 'offline' : 'not connected'}` : `${cal.name} · ${cal.headline}`}
        </span>
        {disconnected && cal.setupHint && <CopyHintButton hint={cal.setupHint} />}
      </div>
    );
  }

  return row;
});
