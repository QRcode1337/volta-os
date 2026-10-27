'use client';
// LTM today: capture count, live state, top-app mix and a 14-day activity strip. Data: /api/ltm/today (TodayWidget's
// request, same URL/poll) and /api/ltm/activity?days=14 (ActivityHeatmap's request), both via the shared store.

import Link from 'next/link';
import { useMemo } from 'react';
import { Radio } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { ApiError, agoLabel, appColor, dayLabel, hhmm, minutesBetween, nowLocalIso } from '@/components/ltm/ltm-client';
import { LTM_LIVE_MINUTES, type LtmActivity, type LtmToday } from '@/types/sources';
import type { LtmCaptureSummary } from '@/types/ltm';
import { useNow } from '@/components/dashboard/widgets/hooks';
import { addDays } from '@/components/dashboard/widgets/left-time';
import { errorText, localIso } from '@/components/dashboard/widgets/right-hooks';
import { useSharedJson } from '@/components/dashboard/widgets/shared-json';
import { Chip, MCard, OfflineNote, Skel, StaleNote } from './parts';

const POLL_MS = 60_000;
const DAYS = 14;
const RECENT_FETCH = 30; // same query as TodayWidget, so the request is shared
const OTHER_COLOR = '#3A3834';
const mixColor = (app: string) => (app === 'Other' ? OTHER_COLOR : appColor(app));

/** Window title when it says more than the app name. Never the OCR snippet (raw screen text; the home may be recorded). */
function windowTitle(c: LtmCaptureSummary): string | null {
  const t = c.title.trim();
  return t && t.toLowerCase() !== c.app.trim().toLowerCase() ? t : null;
}

export function LtmCard() {
  const now = useNow(60_000);
  const day = (now ? localIso(now) : nowLocalIso()).slice(0, 10);
  const today = useSharedJson<LtmToday>(`/api/ltm/today?date=${day}&recent=${RECENT_FETCH}`, POLL_MS);
  const activity = useSharedJson<LtmActivity>(`/api/ltm/activity?days=${DAYS}`, POLL_MS);

  const t = today.data;
  const date = t?.date ?? null;
  const offline = today.error instanceof ApiError && (today.error.unavailable || today.error.status === 503);
  const lastMins = useMemo(
    () => (t?.lastTs && now ? Math.max(0, minutesBetween(t.lastTs.slice(0, 19), localIso(now))) : null),
    [t?.lastTs, now],
  );
  const live = lastMins != null && lastMins <= LTM_LIVE_MINUTES;

  const recent = useMemo(() => {
    const out: LtmCaptureSummary[] = [];
    let lastKey = '';
    for (const c of Array.isArray(t?.recent) ? t.recent : []) {
      const key = `${c.app}|${(windowTitle(c) ?? '').slice(0, 60)}`;
      if (key === lastKey) continue; // collapse back-to-back duplicates
      lastKey = key;
      out.push(c);
      if (out.length === 2) break;
    }
    return out;
  }, [t]);

  const mixTotal = t ? t.mix.reduce((s, m) => s + m.count, 0) : 0;

  let body;
  if (!t && (today.loading || !today.error)) {
    body = (
      <div aria-label="Loading today's captures" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Skel className="h-11 w-28" />
          <Skel className="h-8 w-24" />
        </div>
        <Skel className="h-2 w-full rounded-full" />
        <Skel className="h-10 w-full" />
      </div>
    );
  } else if (!t) {
    body = (
      <OfflineNote
        label={offline ? 'Screen memory offline' : 'Could not load today'}
        message={errorText(today.error)}
        onRetry={() => void today.reload()}
        busy={today.refreshing}
      />
    );
  } else {
    body = (
      <>
        <div className="flex items-end justify-between gap-3">
          <span className="font-doto text-[44px] font-extrabold leading-none tabular-nums text-orange [text-shadow:0_0_20px_rgba(255,85,0,0.35)]">
            {formatInt(t.count)}
          </span>
          <div className="min-w-0 text-right">
            <span className="hud-label block">Captures today</span>
            <span className="block truncate font-mono text-[10px] tabular-nums leading-[14px] text-muted">
              {t.firstTs && t.lastTs ? `${hhmm(t.firstTs)}–${hhmm(t.lastTs)}` : 'no activity yet'}
              {lastMins != null && (
                <span className={cn('ml-1', live ? 'text-green' : 'text-muted')}>{live ? '· live' : `· ${agoLabel(lastMins)}`}</span>
              )}
            </span>
          </div>
        </div>

        {t.count === 0 ? (
          <p className="mt-2 text-[12.5px] leading-snug text-secondary">No screen captures yet today. The LTM daemon may be paused.</p>
        ) : (
          <>
            {/* Today's mix */}
            <div className="mt-3 flex h-2 gap-[2px] overflow-hidden rounded-full" aria-hidden>
              {t.mix.map((m) => (
                <span key={m.app} className="h-full" style={{ flex: `${m.count} 1 0%`, background: mixColor(m.app) }} />
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
              {t.mix.slice(0, 4).map((m) => (
                <span key={m.app} className="flex min-w-0 items-center gap-1.5 font-mono text-[10.5px] uppercase leading-[16px] tracking-[0.04em]">
                  <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: mixColor(m.app) }} />
                  <span className="font-semibold tabular-nums text-paper">{Math.round((m.count / Math.max(1, mixTotal)) * 100)}%</span>
                  <span className="max-w-[90px] truncate text-muted">{m.app}</span>
                </span>
              ))}
            </div>

            {/* Recent */}
            {recent.length > 0 && (
              <ul className="mt-2 border-t border-subtle pt-1">
                {recent.map((c) => {
                  const title = windowTitle(c);
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/apps/ltm?capture=${encodeURIComponent(String(c.id))}`}
                        className="flex min-h-10 items-center gap-2 rounded-lg active:bg-panel-hover/60"
                      >
                        <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-secondary">{hhmm(c.ts)}</span>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: appColor(c.app) }} />
                        <span className="max-w-[34%] shrink-0 truncate text-[12.5px] font-medium text-paper">{c.app}</span>
                        <span className={cn('min-w-0 flex-1 truncate text-[12px] text-muted', !title && 'italic opacity-70')}>
                          {title ?? 'no window title'}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
        {today.error && <StaleNote message={errorText(today.error)} />}
      </>
    );
  }

  return (
    <MCard
      title="LTM today"
      icon={<Radio size={14} strokeWidth={2.2} />}
      href={date ? `/apps/ltm?date=${date}` : '/apps/ltm'}
      linkLabel="Open LTM"
      headerExtra={offline ? <Chip tone="red">offline</Chip> : live ? <Chip tone="green">live</Chip> : null}
    >
      {body}
      <ActivityStrip today={day} data={activity.data} loading={activity.loading && !activity.data} error={activity.error} />
    </MCard>
  );
}

/** 14 daily bars (total captures per local day), tap one to open it in LTM. Full-height ≥40px targets. */
function ActivityStrip({
  today,
  data,
  loading,
  error,
}: {
  today: string;
  data: LtmActivity | null;
  loading: boolean;
  error: Error | null;
}) {
  const cols = useMemo(() => {
    const byDate = new Map((data?.days ?? []).map((d) => [d.date, d.total]));
    const latest = data?.days.at(-1)?.date;
    const anchor = latest && latest > today ? latest : today;
    return Array.from({ length: DAYS }, (_, i) => {
      const date = addDays(anchor, i - (DAYS - 1));
      return { date, total: byDate.get(date) ?? 0, dl: dayLabel(date), isToday: date === today };
    });
  }, [data, today]);
  const max = Math.max(1, ...cols.map((c) => c.total));
  const sum = cols.reduce((s, c) => s + c.total, 0);

  return (
    <div className="mt-3 border-t border-subtle pt-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="hud-label">Activity · 14d</span>
        <span className={cn('truncate font-mono text-[10px]', !data && error ? 'text-[#EF4444]' : 'text-muted')}>
          {loading ? 'loading…' : !data && error ? 'activity offline' : `${formatInt(sum)} captures`}
        </span>
      </div>
      {loading ? (
        <Skel className="h-10 w-full" />
      ) : (
        <div className="flex h-10 items-stretch justify-between gap-[3px]" aria-label={!data && error ? 'LTM activity unavailable' : undefined}>
          {cols.map((c) => {
            const h = data ? Math.max(c.total > 0 ? 12 : 4, Math.round((c.total / max) * 100)) : 4;
            const bar = (
              <span className="flex h-full w-full items-end">
                <span
                  className={cn(
                    'w-full rounded-[3px]',
                    !data ? 'border border-dashed border-subtle/70' : c.total === 0 ? 'bg-subtle' : c.isToday ? 'bg-orange shadow-[0_0_8px_rgba(255,85,0,0.45)]' : 'bg-orange/50',
                  )}
                  style={{ height: `${h}%` }}
                />
              </span>
            );
            return c.total > 0 ? (
              <Link
                key={c.date}
                href={`/apps/ltm?date=${c.date}`}
                aria-label={`Open ${c.dl.dow} ${c.dl.label} in LTM (${formatInt(c.total)} captures)`}
                className="min-w-0 flex-1 outline-none focus-visible:ring-1 focus-visible:ring-orange/60"
              >
                {bar}
              </Link>
            ) : (
              <span key={c.date} className="min-w-0 flex-1">
                {bar}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
