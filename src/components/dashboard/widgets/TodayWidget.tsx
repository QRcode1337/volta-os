'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { CalendarDays, RotateCw } from 'lucide-react';
import { HudPanel } from '@/components/robo-ui';
import { ApiError, agoLabel, appColor, dayLabel, hhmm, minutesBetween, nowLocalIso } from '@/components/ltm/ltm-client';
import { LTM_LIVE_MINUTES, type LtmToday } from '@/types/sources';
import type { LtmCaptureSummary } from '@/types/ltm';
import { cn } from '@/lib/cn';
import { useNow } from './hooks';
import { errorText, localIso, useMeasure } from './right-hooks';
import { useSharedJson } from './shared-json';

const POLL_MS = 60_000;
const OTHER_COLOR = '#3A3834';
const MAX_RECENT = 3;
const RECENT_FETCH = 30; // /api/ltm/today?recent= (1–50)

// Fixed line metrics (px) used to fit the layout to the measured body height (no hidden scroll).
const GAP = 4; // min gap between the three blocks (justify-between spreads any surplus)
const RECENT_HEAD = 16; // 14px label + mb-0.5
const RECENT_ROW = 20; // 14px line + py 3×2
const MIX_FIXED = 30; // 14px label + mb-1 · 8px bar · mt-1
const LEGEND_ROW = 14;

interface Fit {
  recent: number;
  cols: 2 | 3;
  legendRows: number;
}

// Richest layout first; the first that fits the measured height wins.
const FITS: { recent: number; cols: 2 | 3; maxRows: number }[] = [
  { recent: 3, cols: 2, maxRows: Infinity },
  { recent: 3, cols: 3, maxRows: Infinity },
  { recent: 2, cols: 3, maxRows: Infinity },
  { recent: 2, cols: 3, maxRows: 1 },
  { recent: 1, cols: 3, maxRows: 1 },
  { recent: 1, cols: 3, maxRows: 0 },
];

function pickFit(avail: number | null, hero: number, mixLen: number, recentLen: number): Fit {
  for (const f of FITS) {
    const recent = Math.min(f.recent, recentLen);
    const legendRows = Math.min(f.maxRows, Math.ceil(mixLen / f.cols));
    const need =
      hero + 2 * GAP + RECENT_HEAD + RECENT_ROW * recent + (MIX_FIXED - (legendRows ? 0 : 4)) + LEGEND_ROW * legendRows;
    if (avail == null || need <= avail) return { recent, cols: f.cols, legendRows };
  }
  return { recent: Math.min(1, recentLen), cols: 3, legendRows: 0 };
}

const mixColor = (app: string) => (app === 'Other' ? OTHER_COLOR : appColor(app));

/**
 * The window title, when it says more than the app name. Deliberately never falls back to the OCR
 * snippet: that is raw screen text (messages, URLs, terminal output) and the home screen may be recorded.
 */
function windowTitle(c: LtmCaptureSummary): string | null {
  const t = c.title.trim();
  return t && t.toLowerCase() !== c.app.trim().toLowerCase() ? t : null;
}

/** Newest captures, collapsing back-to-back duplicates (same app + same window title). */
function recentRows(items: LtmCaptureSummary[]): LtmCaptureSummary[] {
  const out: LtmCaptureSummary[] = [];
  let lastKey = '';
  for (const c of items) {
    const key = `${c.app}|${(windowTitle(c) ?? '').slice(0, 60)}`;
    if (key === lastKey) continue;
    lastKey = key;
    out.push(c);
    if (out.length === MAX_RECENT) break;
  }
  return out;
}

/**
 * Home TODAY panel — live screen-capture stats from unvolta-ltm (/api/ltm/today), through the shared store:
 * polled every 60s while the tab is visible, paused while hidden.
 */
export function TodayWidget({ className }: { className?: string }) {
  // Client clock (null on the server / first render), re-read every minute for the "ago" label and the date.
  const now = useNow(60_000);
  // Ask for *today's* local date explicitly (the API's default is the newest day in the DB). The key is
  // recomputed every render (the clock re-renders each minute), so at midnight the entry switches to the
  // new day (while the tab is hidden the new key waits until it is shown). It never reaches the markup, so the server-rendered value can't cause a hydration mismatch.
  const day = (now ? localIso(now) : nowLocalIso()).slice(0, 10);
  // One request: count, mix and the RECENT rows come from the same snapshot. `recent=30` (default 5) leaves
  // enough rows for 3 distinct windows to survive de-duplication.
  const { data, error, loading, refreshing, reload } = useSharedJson<LtmToday>(
    `/api/ltm/today?date=${day}&recent=${RECENT_FETCH}`,
    POLL_MS,
  );
  const [fitRef, fitSize] = useMeasure();
  const [heroRef, heroSize] = useMeasure(); // hero mounts only once data has loaded

  const t = data;
  const date = t?.date ?? null;
  const ltmHref = date ? `/apps/ltm?date=${date}` : '/apps/ltm';
  const offline = error instanceof ApiError && (error.unavailable || error.status === 503);
  const lastMins = useMemo(
    () => (t?.lastTs && now ? Math.max(0, minutesBetween(t.lastTs.slice(0, 19), localIso(now))) : null),
    [t?.lastTs, now],
  );
  const live = lastMins != null && lastMins <= LTM_LIVE_MINUTES;
  const mixTotal = t ? t.mix.reduce((s, m) => s + m.count, 0) : 0;
  const allRows = t ? recentRows(Array.isArray(t.recent) ? t.recent : []) : [];
  const fit = pickFit(fitSize?.height ?? null, heroSize?.height ?? 36, t?.mix.length ?? 0, allRows.length);
  const rows = allRows.slice(0, fit.recent);
  const legend = t ? t.mix.slice(0, fit.legendRows * fit.cols) : [];

  return (
    <HudPanel
      title="TODAY"
      icon={<CalendarDays size={14} strokeWidth={2.2} />}
      headerExtra={
        <span
          className={cn(
            'rounded-full border px-1.5 font-mono text-[9px] font-semibold tabular-nums',
            offline ? 'border-[#EF4444]/40 bg-[#EF4444]/10 text-[#EF4444]' : 'border-subtle bg-obsidian text-secondary',
          )}
          title={date ? dayLabel(date).long : undefined}
        >
          {offline ? 'LTM OFFLINE' : date ? `${dayLabel(date).dow} · ${dayLabel(date).label}` : '—'}
        </span>
      }
      actions={[{ label: 'OPEN LTM', href: ltmHref }]}
      className={className}
      bodyClassName="flex flex-col px-3 py-2"
    >
      {/* Fitted region: its measured height picks how many RECENT rows / legend columns are shown. The -mx/px pair
          gives the rows' -mx-1.5 hover background room inside the box, so nothing scrolls sideways. */}
      <div ref={fitRef} className="hud-scroll -mx-1.5 flex min-h-0 flex-1 flex-col justify-between gap-1 overflow-y-auto overflow-x-hidden px-1.5">
        {loading && !t ? (
          <TodaySkeleton />
        ) : !t ? (
          <div className="flex h-full flex-col items-start justify-center gap-1.5">
            <span className={cn('hud-label text-[10px]', offline ? 'text-[#EF4444]' : 'text-amber')}>
              {offline ? 'SCREEN MEMORY UNAVAILABLE' : 'COULD NOT LOAD TODAY'}
            </span>
            <p className="selectable text-[11.5px] leading-snug text-secondary">{errorText(error)}</p>
            <button
              type="button"
              onClick={() => void reload()}
              className="mt-0.5 inline-flex h-6 items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-highlight hover:text-paper"
            >
              <RotateCw size={10} className={cn(refreshing && 'robo-spin')} /> RETRY
            </button>
          </div>
        ) : (
          <>
            {/* Hero */}
            <div ref={heroRef} className="flex shrink-0 items-center justify-between gap-2">
              <span
                className="font-doto font-extrabold leading-none text-orange tabular-nums [text-shadow:0_0_20px_rgba(255,85,0,0.35)]"
                style={{ fontSize: 'clamp(30px, 2.8vw, 44px)' }}
              >
                {t.count.toLocaleString('en-US')}
              </span>
              <span className="min-w-0 text-right">
                <span className="hud-label block text-[10px] leading-[14px]">SCREEN CAPTURES</span>
                <span className="block font-mono text-[9.5px] leading-[14px] tabular-nums text-muted">
                  {t.firstTs && t.lastTs ? `${hhmm(t.firstTs)}–${hhmm(t.lastTs)}` : 'no activity yet'}
                  {lastMins != null && (
                    <span className={cn('ml-1', live ? 'text-green' : 'text-muted')} title={`Last capture ${t.lastTs?.slice(11, 19)}`}>
                      {live && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green align-middle robo-pulse" />}
                      {live ? 'live' : `· ${agoLabel(lastMins)}`}
                    </span>
                  )}
                </span>
                {error && (
                  <span className="block font-mono text-[9px] leading-[13px] text-amber" title={errorText(error)}>
                    refresh failed · showing last data
                  </span>
                )}
              </span>
            </div>

            {t.count === 0 ? (
              <p className="text-[11.5px] leading-snug text-secondary">
                No screen captures yet today. The LTM daemon may be paused — open the viewer to check earlier days.
              </p>
            ) : (
              <>
                {/* Recent */}
                <div className="shrink-0">
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className="hud-label text-[10px] leading-[14px]">RECENT</span>
                    <span className="font-mono text-[9px] leading-[14px] text-muted">newest first</span>
                  </div>
                  <ul className="flex flex-col">
                    {rows.map((c) => {
                      const title = windowTitle(c);
                      return (
                        <li key={c.id}>
                          <Link
                            href={`/apps/ltm?capture=${encodeURIComponent(String(c.id))}`}
                            title={`${c.ts.slice(11, 19)} · ${c.app} — ${title ?? 'no window title'}\nOpen this capture in LTM`}
                            className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-[3px] leading-[14px] transition-colors hover:bg-panel-hover"
                          >
                            <span className="shrink-0 font-mono text-[10px] tabular-nums text-secondary">{hhmm(c.ts)}</span>
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: appColor(c.app) }} />
                            <span className="max-w-[38%] shrink-0 truncate text-[11.5px] font-medium text-paper">{c.app}</span>
                            <span className={cn('min-w-0 flex-1 truncate text-[11px] text-muted', !title && 'italic opacity-70')}>
                              {title ?? 'no window title'}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Today's mix */}
                <div className="shrink-0">
                  <div className="hud-label mb-1 text-[10px] leading-[14px]">TODAY&apos;S MIX</div>
                  <div className="flex h-2 gap-[2px] overflow-hidden rounded-full">
                    {t.mix.map((m) => (
                      <span
                        key={m.app}
                        title={`${m.count} ${m.app} · ${Math.round((m.count / Math.max(1, mixTotal)) * 100)}%`}
                        className="h-full transition-[filter] first:rounded-l-full last:rounded-r-full hover:brightness-125"
                        style={{ flex: `${m.count} 1 0%`, background: mixColor(m.app) }}
                      />
                    ))}
                  </div>
                  {legend.length > 0 && (
                    <div className={cn('mt-1 grid gap-x-3', fit.cols === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
                      {legend.map((m) => (
                        <span
                          key={m.app}
                          title={`${m.count} ${m.app}`}
                          className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] uppercase leading-[14px] tracking-[0.06em]"
                        >
                          <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: mixColor(m.app) }} />
                          <span className="font-semibold tabular-nums text-paper">{m.count}</span>
                          <span className="truncate text-muted">{m.app}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </HudPanel>
  );
}

function TodaySkeleton() {
  return (
    <div aria-label="Loading today's captures" className="flex h-full animate-pulse flex-col justify-between gap-2">
      <div className="flex items-center justify-between">
        <span className="h-9 w-20 rounded-md bg-panel-elevated" />
        <span className="flex flex-col items-end gap-1">
          <span className="h-2.5 w-24 rounded bg-panel-elevated" />
          <span className="h-2 w-16 rounded bg-panel-elevated" />
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-3 rounded bg-panel-elevated" style={{ width: `${92 - i * 9}%` }} />
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="h-2 w-full rounded-full bg-panel-elevated" />
        <span className="h-2.5 w-2/3 rounded bg-panel-elevated" />
      </div>
    </div>
  );
}

export default TodayWidget;
