'use client';

import { memo, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ApiError, dayLabel } from '@/components/ltm/ltm-client';
import type { LtmActivity } from '@/types/sources';
import { formatInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { addDays } from './left-time';
import { useSharedJson } from './shared-json';

const DAYS = 14;
const POLL_MS = 60_000;
const BLOCKS = [
  { label: '00–06', from: 0 },
  { label: '06–12', from: 6 },
  { label: '12–18', from: 12 },
  { label: '18–24', from: 18 },
] as const;

const CELL = 'h-2.5 w-2.5 rounded-[3px] 2xl:h-3 2xl:w-3';
const ROW_H = 'h-2.5 2xl:h-3';
/** Orange ramp; level 0 = no captures (empty cell). */
const LEVEL_CLS = [
  'border border-subtle bg-obsidian',
  'bg-orange/20',
  'bg-orange/45',
  'bg-orange/70',
  'bg-orange shadow-[0_0_8px_rgba(255,85,0,0.45)]',
] as const;
/** LTM unreachable and nothing loaded yet: counts are unknown, not zero. */
const UNKNOWN_CLS = 'border border-dashed border-subtle/70 bg-transparent';

interface Column {
  date: string;
  label: string; // "Thu Oct 22"
  initial: string; // "T"
  weekend: boolean;
  isToday: boolean;
  blocks: number[]; // 4 × 6-hour capture counts
  total: number;
}

/**
 * Real LTM screen-capture activity: last 14 local days (columns) × four 6-hour blocks (rows),
 * from /api/ltm/activity. Click a day to open it in the LTM viewer.
 * `today` is the browser-local "yyyy-mm-dd" (null until mounted). Memoized: the parent re-renders
 * on a clock tick, but this only needs to change when `today` flips or its own 60s poll lands (shared,
 * visibility-aware store: no requests while the tab is hidden).
 * If LTM is offline before any data arrives, cells render as neutral "unknown" (no counts, no hover).
 */
export const ActivityHeatmap = memo(function ActivityHeatmap({ today, className }: { today: string | null; className?: string }) {
  const { data, error: err } = useSharedJson<LtmActivity>(`/api/ltm/activity?days=${DAYS}`, POLL_MS);
  const error = useMemo(
    () => (err ? { message: err.message || 'request failed', unavailable: err instanceof ApiError && err.unavailable } : null),
    [err],
  );
  const [hover, setHover] = useState<{ col: number; row: number } | null>(null);

  const columns = useMemo<Column[] | null>(() => {
    if (!today) return null;
    const byDate = new Map((data?.days ?? []).map((d) => [d.date, d]));
    const latest = data?.days.at(-1)?.date;
    const anchor = latest && latest > today ? latest : today;
    return Array.from({ length: DAYS }, (_, i) => {
      const date = addDays(anchor, i - (DAYS - 1));
      const day = byDate.get(date);
      const blocks = BLOCKS.map((b) => (day ? day.hours.slice(b.from, b.from + 6).reduce((s, x) => s + (x || 0), 0) : 0));
      const dl = dayLabel(date);
      return {
        date,
        label: `${dl.dow} ${dl.label}`,
        initial: dl.dow.charAt(0),
        weekend: dl.dow === 'Sat' || dl.dow === 'Sun',
        isToday: date === today,
        blocks,
        total: blocks.reduce((s, x) => s + x, 0),
      };
    });
  }, [today, data]);

  const max = columns ? Math.max(0, ...columns.flatMap((c) => c.blocks)) : 0;
  const level = (v: number) => (v <= 0 || max <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil(4 * Math.sqrt(v / max)))));
  const pending = !data && !error;
  const unknown = !data && !!error;
  const sum = columns?.reduce((s, c) => s + c.total, 0) ?? 0;
  const busiest = columns?.reduce<Column | null>((b, c) => (c.total > (b?.total ?? 0) ? c : b), null) ?? null;

  let status: ReactNode;
  if (hover && columns && data) {
    const col = columns[hover.col];
    status = (
      <>
        {col.label} · {BLOCKS[hover.row].label} ·{' '}
        <span className="text-orange">{formatInt(col.blocks[hover.row])}</span> captures
      </>
    );
  } else if (pending || !columns) {
    status = <span className="text-muted">Loading LTM activity…</span>;
  } else if (!data && error) {
    status = (
      <span className="text-[#EF4444]" title={error.message}>
        {error.unavailable ? 'LTM offline' : 'LTM activity unavailable'} · {error.message}
      </span>
    );
  } else if (sum === 0) {
    status = <span className="text-muted">No captures in the last 14 days</span>;
  } else {
    status = (
      <span className="text-muted">
        {formatInt(sum)} captures{busiest ? ` · peak ${busiest.label}` : ''}
        {error ? <span className="text-amber" title={error.message}> · refresh failed</span> : null}
      </span>
    );
  }

  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="hud-label text-[10px]">LTM ACTIVITY · 14D</span>
        <span
          className="flex items-center gap-[3px] font-mono text-[8.5px] uppercase tracking-[0.06em] text-muted"
          title="Captures per 6-hour block, ramp scaled to the busiest block"
        >
          <span className="mr-0.5">Less</span>
          {LEVEL_CLS.map((c, i) => (
            <span key={i} className={cn('h-1.5 w-1.5 rounded-[2px]', c, i === 4 && 'shadow-none')} />
          ))}
          <span className="ml-0.5">More</span>
        </span>
      </div>

      <div className="flex gap-1.5">
        <div className="flex w-[30px] shrink-0 flex-col gap-[3px]">
          <span className="h-[9px]" />
          {BLOCKS.map((b, r) => (
            <span
              key={b.label}
              className={cn(
                ROW_H,
                'flex items-center font-mono text-[8.5px] leading-none transition-colors',
                hover?.row === r ? 'text-orange' : 'text-muted',
              )}
            >
              {b.label}
            </span>
          ))}
        </div>

        <div
          className="flex min-w-0 flex-1 justify-between"
          onMouseLeave={() => setHover(null)}
          aria-label={unknown ? 'LTM activity unknown (LTM offline)' : undefined}
        >
          {(columns ?? Array.from({ length: DAYS }, () => null)).map((col, c) => {
            const inner = (
              <>
                <span
                  className={cn(
                    'flex h-[9px] items-center font-mono text-[8px] leading-none transition-colors',
                    !col
                      ? 'text-muted/40'
                      : col.isToday || hover?.col === c
                        ? 'font-bold text-orange'
                        : col.weekend
                          ? 'text-muted/60 group-hover/col:text-paper'
                          : 'text-muted group-hover/col:text-paper',
                  )}
                >
                  {col ? col.initial : '·'}
                </span>
                {BLOCKS.map((b, r) => {
                  if (!col || pending) {
                    return <span key={b.label} className={cn(CELL, 'animate-pulse bg-subtle/60')} />;
                  }
                  if (unknown) {
                    return <span key={b.label} aria-hidden className={cn(CELL, UNKNOWN_CLS)} />;
                  }
                  const v = col.blocks[r];
                  const active = hover?.col === c && hover.row === r;
                  const dim = hover && hover.col !== c && hover.row !== r;
                  return (
                    <span
                      key={b.label}
                      title={`${col.label} · ${b.label} · ${formatInt(v)} captures`}
                      onMouseEnter={() => setHover({ col: c, row: r })}
                      className={cn(
                        CELL,
                        'transition-all duration-150',
                        LEVEL_CLS[level(v)],
                        active && 'scale-125 ring-1 ring-orange ring-offset-1 ring-offset-panel',
                        dim && 'opacity-50',
                        col.isToday && !active && 'ring-1 ring-orange/40 ring-offset-1 ring-offset-panel',
                      )}
                    />
                  );
                })}
              </>
            );
            const colCls = 'group/col flex flex-col items-center gap-[3px] rounded-[4px] outline-none';
            if (col && col.total > 0) {
              return (
                <Link
                  key={col.date}
                  href={`/apps/ltm?date=${col.date}`}
                  aria-label={`Open ${col.label} in LTM (${formatInt(col.total)} captures)`}
                  className={cn(colCls, 'cursor-pointer focus-visible:ring-1 focus-visible:ring-orange/60')}
                >
                  {inner}
                </Link>
              );
            }
            return (
              <span key={col?.date ?? `ph-${c}`} className={cn(colCls, 'cursor-default')}>
                {inner}
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-1 h-3 truncate font-mono text-[9.5px] leading-3 text-secondary">{status}</div>
    </div>
  );
});

export default ActivityHeatmap;
