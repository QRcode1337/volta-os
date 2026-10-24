'use client';

import { useMemo, useRef } from 'react';
import Link from 'next/link';
import { Clock, RotateCw } from 'lucide-react';
import { HudPanel } from '@/components/robo-ui';
import type { RealRoutine, RoutineHealth } from '@/types/sources';
import { cn } from '@/lib/cn';
import { useNow } from './hooks';
import { errorText, localHHMM, relativeUntil, useElementSize } from './right-hooks';
import { useSharedJson } from './shared-json';

const POLL_MS = 60_000;
const MAX_ROWS = 4;
const STALL_MS = 60 * 60_000; // a job >1h past its due time is "stalled" (scheduler/gateway not running it)
const ROUTINES_HREF = '/second-brain?view=routines';
const RED = '#EF4444';
// Fixed row metrics (px) so the row count can be fitted to the measured body height.
const HEAD_H = 17; // column header: 13px line + pb-1
const ROW_H = 35; // border-t 1 + py 4×2 + two text lines (15 + 11)

const SOURCE_STYLE: Record<RealRoutine['source'], string> = {
  openclaw: 'border-purple/40 bg-purple/10 text-purple',
  launchd: 'border-highlight bg-panel-elevated text-secondary',
};

const SIGNALS: Record<number, string> = { 1: 'SIGHUP', 2: 'SIGINT', 6: 'SIGABRT', 9: 'SIGKILL', 11: 'SIGSEGV', 15: 'SIGTERM' };

/** launchd exit status: the server's parsed exitCode, else "last exit status -15" from lastError. */
function exitOf(r: RealRoutine): { code: number; signal: string | null } | null {
  let code: number | null = typeof r.exitCode === 'number' ? r.exitCode : null;
  if (code === null) {
    const m = r.lastError ? /exit status (-?\d+)/.exec(r.lastError) : null;
    code = m ? Number(m[1]) : null;
  }
  if (code === null || !Number.isFinite(code)) return null;
  return { code, signal: code < 0 ? (SIGNALS[-code] ?? `signal ${-code}`) : null };
}

const exitText = (ex: { code: number; signal: string | null }) => (ex.signal ? `${ex.signal} (${ex.code})` : `status ${ex.code}`);

/**
 * One verdict per job, computed on the server (routines.ts healthOf → RealRoutine.health) so home and
 * Second Brain agree. The legacy rules below only apply to a payload from before `health` existed.
 */
function healthOf(r: RealRoutine): RoutineHealth {
  if (r.health) return r.health;
  if (!r.enabled) return 'disabled';
  if (r.source === 'launchd') {
    if (r.running) return 'running';
    return r.lastStatus === 'error' ? 'failing' : r.lastStatus === 'ok' ? 'ok' : 'idle';
  }
  if (r.lastStatus === 'error' || r.consecutiveErrors > 0) return 'failing';
  return r.lastStatus === 'skipped' ? 'skipped' : r.lastStatus === 'ok' ? 'ok' : 'idle';
}

/** Running now, but launchctl's status column says the *previous* instance failed (e.g. SIGTERM on restart). */
const isRestarted = (r: RealRoutine) => healthOf(r) === 'running' && r.lastStatus === 'error';

function errorTooltip(r: RealRoutine): string {
  if (r.source === 'launchd') {
    const ex = exitOf(r);
    return ex ? `not running · last exit ${exitText(ex)}` : (r.lastError ?? 'last run failed');
  }
  const runs = r.consecutiveErrors > 0 ? `${r.consecutiveErrors} consecutive error${r.consecutiveErrors === 1 ? '' : 's'}` : 'last run failed';
  return `${runs}${r.lastError ? ` — ${r.lastError}` : ''}`;
}

function restartedNote(r: RealRoutine): string {
  const ex = exitOf(r);
  const how = ex ? (ex.signal ? `restarted (${ex.signal})` : `previous instance exited ${ex.code}`) : 'previous instance failed';
  return `${r.name}: running${r.pid ? ` (pid ${r.pid})` : ''} · ${how}`;
}

function stoppedNote(r: RealRoutine): string {
  const ex = exitOf(r);
  return `${r.name}: stopped${ex ? ` · last exit ${exitText(ex)}` : ''}`;
}

function skippedNote(r: RealRoutine): string {
  return `${r.name}: last run skipped${r.lastError ? ` — ${r.lastError}` : ''}`;
}

interface UpcomingRow {
  r: RealRoutine;
  at: number;
}

/**
 * Home ROUTINES panel — next scheduled jobs from /api/routines (shared store, polled every 60s while visible).
 * Lists every enabled job with a nextRunAt: OpenClaw's own scheduler time, or (nextRunSource 'plist') the
 * time the server computes from a LaunchAgent's StartCalendarInterval (every entry, local time, honouring
 * Weekday/Day/Month). Interval, keep-alive and on-demand jobs have no next run and aren't listed, but every
 * job counts toward "failing" via the server's single `health` verdict.
 */
export function RoutinesWidget({ className }: { className?: string }) {
  const { data, error, loading, refreshing, reload } = useSharedJson<{ routines: RealRoutine[] }>('/api/routines', POLL_MS);
  const now = useNow(60_000); // null until mounted → no time math during SSR/hydration
  const fitRef = useRef<HTMLDivElement>(null);
  const fit = useElementSize(fitRef);

  const routines = data?.routines;
  const enabled = useMemo(() => (routines ?? []).filter((r) => r.enabled), [routines]);
  const failing = useMemo(() => enabled.filter((r) => healthOf(r) === 'failing'), [enabled]);
  const restarted = useMemo(() => enabled.filter(isRestarted), [enabled]);
  const stopped = useMemo(() => enabled.filter((r) => healthOf(r) === 'stopped'), [enabled]);
  const skipped = useMemo(() => enabled.filter((r) => healthOf(r) === 'skipped'), [enabled]);

  const { upcoming, stalled } = useMemo(() => {
    const up: UpcomingRow[] = [];
    const st: UpcomingRow[] = [];
    if (!now) return { upcoming: up, stalled: st };
    const nowMs = now.getTime();
    for (const r of enabled) {
      const at = r.nextRunAt ? Date.parse(r.nextRunAt) : NaN;
      if (Number.isNaN(at)) continue; // interval / keep-alive / on-demand jobs: no next run
      (at < nowMs - STALL_MS ? st : up).push({ r, at });
    }
    up.sort((a, b) => a.at - b.at);
    st.sort((a, b) => a.at - b.at);
    return { upcoming: up, stalled: st };
  }, [enabled, now]);

  const showNote = !!routines && !!error;
  // The footnote sits outside the fitted region, so the measured height already excludes it.
  const rowsFit = fit ? Math.floor((fit.height - HEAD_H) / ROW_H) : MAX_ROWS;
  const rowCount = Math.max(1, Math.min(MAX_ROWS, rowsFit));
  const shown = upcoming.slice(0, rowCount);

  // Not-failing states that still deserve a look; shown in the header pill tooltips.
  const asideTip = [
    ...(skipped.length ? ['', `Last run skipped (${skipped.length}):`, ...skipped.map(skippedNote)] : []),
    ...(stopped.length ? ['', `Stopped by a signal (${stopped.length}, not counted as failing):`, ...stopped.map(stoppedNote)] : []),
    ...(restarted.length ? ['', 'Running now (previous instance stopped, not counted):', ...restarted.map(restartedNote)] : []),
  ];
  const failTip = [...failing.map((r) => `${r.name}: ${errorTooltip(r)}`), ...asideTip].join('\n');
  const stallTip = [
    `${stalled.length} enabled job${stalled.length === 1 ? '' : 's'} more than 1h past due — scheduler or gateway may be down:`,
    ...stalled.map(({ r, at }) => `${r.name}: due ${now ? relativeUntil(at, now.getTime()) : ''}`),
  ].join('\n');

  const ready = !!routines && !!now;

  return (
    <HudPanel
      title="ROUTINES"
      icon={<Clock size={14} strokeWidth={2.2} />}
      headerExtra={
        <>
          {failing.length > 0 && (
            <Link
              href={ROUTINES_HREF}
              title={failTip}
              className="whitespace-nowrap rounded-full border px-1.5 font-mono text-[9px] font-semibold tabular-nums transition-[filter] hover:brightness-125"
              style={{ color: RED, borderColor: `${RED}66`, background: `${RED}1A` }}
            >
              {failing.length} failing
            </Link>
          )}
          {stalled.length > 0 && (
            <Link
              href={ROUTINES_HREF}
              title={stallTip}
              className="whitespace-nowrap rounded-full border border-amber/40 bg-amber/10 px-1.5 font-mono text-[9px] font-semibold tabular-nums text-amber transition-[filter] hover:brightness-125"
            >
              {stalled.length} stalled
            </Link>
          )}
          {failing.length === 0 && stalled.length === 0 && (
            <span
              className="rounded-full border border-subtle bg-obsidian px-1.5 font-mono text-[9px] font-semibold text-secondary"
              title={asideTip.length ? ['No failing jobs.', ...asideTip].join('\n') : 'No failing jobs.'}
            >
              24h
            </span>
          )}
        </>
      }
      actions={[{ label: 'ALL', href: ROUTINES_HREF }]}
      className={className}
      bodyClassName="flex flex-col px-3 py-1.5"
    >
      {/* Fitted region: its measured height decides how many rows (≤4) are shown, so nothing hides behind a scroll. */}
      <div ref={fitRef} className="hud-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-[54px_minmax(0,1fr)_52px] pb-1 font-mono text-[9px] font-semibold uppercase leading-[13px] tracking-[0.1em] text-muted">
          <span>Time</span>
          <span>Routine</span>
          <span className="text-right">Status</span>
        </div>

        {!ready && (loading || !error) ? (
          <ul aria-label="Loading routines" className="animate-pulse">
            {Array.from({ length: rowCount }, (_, i) => (
              <li key={i} className="flex items-center gap-2 border-t border-subtle py-[9px]">
                <span className="h-4 w-11 rounded-full bg-panel-elevated" />
                <span className="h-2.5 flex-1 rounded bg-panel-elevated" style={{ maxWidth: `${70 - i * 8}%` }} />
                <span className="ml-auto h-2.5 w-9 rounded bg-panel-elevated" />
              </li>
            ))}
          </ul>
        ) : !routines ? (
          <div className="flex flex-col items-start gap-1.5 border-t border-subtle pt-2">
            <span className="hud-label text-[10px] text-amber">ROUTINES UNAVAILABLE</span>
            <p className="selectable text-[11.5px] leading-snug text-secondary">{errorText(error)}</p>
            <button
              type="button"
              onClick={reload}
              className="inline-flex h-6 items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-highlight hover:text-paper"
            >
              <RotateCw size={10} className={cn(refreshing && 'robo-spin')} /> RETRY
            </button>
          </div>
        ) : shown.length === 0 ? (
          <p className="border-t border-subtle pt-2 text-[11.5px] leading-snug text-secondary">
            {stalled.length > 0
              ? `No upcoming runs — ${stalled.length} scheduled job${stalled.length === 1 ? ' is' : 's are'} more than 1h overdue. Check the OpenClaw gateway.`
              : `No upcoming scheduled jobs. ${routines.length} routine${routines.length === 1 ? '' : 's'} found — interval, keep-alive and on-demand jobs have no next-run time.`}
          </p>
        ) : (
          <ul>
            {shown.map(({ r, at }, i) => {
              const next = i === 0;
              const h = healthOf(r);
              const bad = h === 'failing';
              const skip = h === 'skipped';
              const when = relativeUntil(at, now!.getTime());
              const tip = [
                `${r.name} · ${r.schedule}`,
                `Next run: ${new Date(at).toLocaleString()} (${when})${r.nextRunSource === 'plist' ? ' · from plist' : ''}`,
                r.agent ? `Agent: ${r.agent}` : '',
                bad ? `Failing — ${errorTooltip(r)}` : '',
                skip ? `Last run skipped${r.lastError ? ` — ${r.lastError}` : ''}` : '',
              ]
                .filter(Boolean)
                .join('\n');
              return (
                <li key={r.id}>
                  <Link
                    href={ROUTINES_HREF}
                    title={tip}
                    className="group grid grid-cols-[54px_minmax(0,1fr)_52px] items-center border-t border-subtle py-[4px] transition-colors hover:bg-panel-hover/60"
                  >
                    <span className="pr-2">
                      <span
                        className={cn(
                          'inline-flex h-5 items-center rounded-full px-2 font-mono text-[10.5px] font-semibold tabular-nums',
                          next
                            ? 'bg-orange text-obsidian shadow-[0_0_10px_rgba(255,85,0,0.4)]'
                            : 'border border-subtle bg-obsidian text-secondary',
                        )}
                      >
                        {localHHMM(at)}
                      </span>
                    </span>
                    <span className="min-w-0 pr-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className={cn('truncate text-[12px] leading-[15px]', next ? 'font-medium text-paper' : 'text-paper/80')}>
                          {r.name}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-[4px] border px-1 font-mono text-[8.5px] font-semibold uppercase leading-[13px] tracking-[0.08em]',
                            SOURCE_STYLE[r.source],
                          )}
                        >
                          {r.source}
                        </span>
                      </span>
                      <span className={cn('block font-mono text-[9px] leading-[11px] tabular-nums', when.includes('overdue') ? 'text-amber' : 'text-muted')}>
                        {when}
                      </span>
                    </span>
                    {/* Status word: ERROR > SKIP > NEXT > QUEUED, so the soonest job's last-run problem is never
                        hidden behind NEXT. Row 0 keeps its orange "next" dot (and orange time pill) either way. */}
                    <span
                      className={cn(
                        'whitespace-nowrap text-right font-mono text-[10px] font-semibold tracking-[0.08em]',
                        bad ? '' : skip ? 'text-amber' : next ? 'text-orange' : 'text-muted',
                      )}
                      style={bad ? { color: RED } : undefined}
                      title={
                        bad
                          ? errorTooltip(r)
                          : skip
                            ? `${next ? 'Next up · ' : ''}${skippedNote(r)}`
                            : next
                              ? 'Next scheduled run'
                              : undefined
                      }
                    >
                      {bad ? (
                        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: RED }} />
                      ) : (
                        next && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-orange align-middle robo-pulse" />
                      )}
                      {bad ? 'ERROR' : skip ? 'SKIP' : next ? 'NEXT' : 'QUEUED'}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {showNote && (
        <p className="shrink-0 font-mono text-[9px] leading-[14px] text-amber" title={errorText(error)}>
          refresh failed · showing last data
        </p>
      )}
    </HudPanel>
  );
}
