'use client';
// Second Brain → Routines: real OpenClaw cron jobs + user LaunchAgents (/api/routines).
// Health, exit status and next-run times all come from the server (routines.ts), so this page and the home
// ROUTINES widget agree; nothing is re-derived here.

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Activity, AlertOctagon, CalendarClock, ChevronDown, Infinity as InfinityIcon, RotateCcw, Timer, Zap } from 'lucide-react';
import type { RoutineItem } from '@/types/os';
import type { RealRoutine, RoutineHealth } from '@/types/sources';
import { formatInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { HeaderStat, ViewState, apiGate, clockLabel, matchesQuery, relTime, useApi, useNow } from './analytics-shared';

type Mode = 'ACTIVE' | 'PASSIVE';
interface Props {
  /** Legacy props from SecondBrainApp — accepted, ignored (routines are now read from /api/routines). */
  routines?: RoutineItem[];
  query?: string;
  modes?: Record<string, Mode>;
  onToggleMode?: (id: string, mode: Mode) => void;
  cap?: number;
  onCap?: (v: number) => void;
}

type Day = RealRoutine['days'][number];
type Health = RoutineHealth;
type Filter = 'all' | 'openclaw' | 'launchd' | 'failing';

const DAYS: Day[] = ['M', 'T', 'W', 'TH', 'F', 'SA', 'SU'];
const JS_DAY_TO_DAY: Day[] = ['SU', 'M', 'T', 'W', 'TH', 'F', 'SA']; // Date#getDay() index → column
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const HEALTH: Record<Health, { label: string; color: string; text: string; border: string; bg: string }> = {
  failing: { label: 'FAILING', color: '#EF4444', text: 'text-red-400', border: 'border-red-500/40', bg: 'bg-red-500/10' },
  skipped: { label: 'SKIPPED', color: '#F5A623', text: 'text-amber', border: 'border-amber/40', bg: 'bg-amber/10' },
  stopped: { label: 'STOPPED', color: '#F5A623', text: 'text-amber', border: 'border-amber/40', bg: 'bg-amber/10' },
  disabled: { label: 'DISABLED', color: '#6E6A61', text: 'text-muted', border: 'border-subtle', bg: 'bg-panel-hover' },
  running: { label: 'RUNNING', color: '#22C55E', text: 'text-green', border: 'border-green/40', bg: 'bg-green/10' },
  ok: { label: 'OK', color: '#22C55E', text: 'text-green', border: 'border-green/30', bg: 'bg-green/5' },
  idle: { label: 'NO RUNS YET', color: '#A39E93', text: 'text-secondary', border: 'border-subtle', bg: 'bg-panel-hover' },
};
const SOURCE_COLOR: Record<RealRoutine['source'], string> = { openclaw: '#A855F7', launchd: '#14B8A6' };

interface Row {
  r: RealRoutine;
  health: Health; // the server's verdict (r.health)
  hours: number[]; // hours of day it fires (empty = interval / keep-alive)
  minute: number;
  days: Day[]; // explicit days (all 7 when the API says "every day")
  exit: number | null; // launchd: previous instance's exit status (r.exitCode)
  nextAt: number | null; // epoch ms of the API's nextRunAt
  nextFromPlist: boolean; // the server computed nextRunAt from the LaunchAgent's StartCalendarInterval
}

/** launchd reports a process killed by a signal as a negative status (-15 SIGTERM, -9 SIGKILL). */
const SIGNAL_NAMES: Record<number, string> = { [-15]: 'SIGTERM', [-9]: 'SIGKILL' };
const isKeepAlive = (r: RealRoutine) => r.schedule === 'keep-alive';
/** Server cadences that fire on calendar dates the weekly grid can't show (hourOfDay is null for these). */
const CALENDAR_CADENCES = new Set<RealRoutine['cadence']>(['yearly', 'monthly', 'mixed']);
const isCalendarCadence = (r: RealRoutine) => CALENDAR_CADENCES.has(r.cadence);

const isoOf = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

/** Hours (and minute) a routine fires at, from its cron string when possible, else the API's hourOfDay. */
function firesAt(r: RealRoutine): { hours: number[]; minute: number } {
  const cron = /^cron\s+(\S+)\s+(\S+)\s+\S+\s+\S+\s+\S+/.exec(r.schedule);
  if (cron) {
    const minute = /^\d+$/.test(cron[1]) ? Number(cron[1]) : 0;
    const hours = new Set<number>();
    for (const part of cron[2].split(',')) {
      const range = /^(\d+)-(\d+)$/.exec(part);
      if (/^\d+$/.test(part)) hours.add(Number(part));
      else if (range) for (let h = Number(range[1]); h <= Number(range[2]) && h < 24; h++) hours.add(h);
    }
    if (hours.size) return { hours: [...hours].filter((h) => h >= 0 && h < 24).sort((a, b) => a - b), minute };
  }
  const hm = /(\d{1,2}):(\d{2})/.exec(r.schedule);
  if (r.hourOfDay !== null) return { hours: [r.hourOfDay], minute: hm ? Number(hm[2]) : 0 };
  return { hours: [], minute: 0 };
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const shortName = (name: string) => name.split(/\s+[—–-]\s+/)[0].replace(/^(ai|com)\.[a-z0-9-]+\./i, '');

export function RoutinesAnalyticsView({ query = '' }: Props) {
  const api = useApi<{ routines: RealRoutine[]; warnings?: string[] }>('/api/routines', 60_000);
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('all');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [openErr, setOpenErr] = useState<Record<string, boolean>>({});

  const rows = useMemo<Row[]>(() => {
    const list = api.data?.routines ?? [];
    return list
      .map((r): Row => {
        const { hours, minute } = firesAt(r);
        const days = r.days.length ? r.days : DAYS;
        const apiNext = r.nextRunAt ? Date.parse(r.nextRunAt) : NaN;
        const nextAt = Number.isNaN(apiNext) ? null : apiNext;
        return {
          r,
          health: r.health,
          hours,
          minute,
          days,
          exit: r.exitCode,
          nextAt,
          nextFromPlist: nextAt !== null && r.nextRunSource === 'plist',
        };
      })
      .sort((a, b) => {
        const fa = a.health === 'failing' ? 0 : 1;
        const fb = b.health === 'failing' ? 0 : 1;
        if (fa !== fb) return fa - fb;
        if (fa === 0 && a.r.consecutiveErrors !== b.r.consecutiveErrors) return b.r.consecutiveErrors - a.r.consecutiveErrors;
        const na = a.nextAt ?? Infinity;
        const nb = b.nextAt ?? Infinity;
        if (na !== nb) return na - nb;
        return a.r.name.localeCompare(b.r.name);
      });
  }, [api.data]);

  const stats = useMemo(() => {
    const enabled = rows.filter((x) => x.r.enabled).length;
    const failing = rows.filter((x) => x.health === 'failing').length;
    const skipped = rows.filter((x) => x.health === 'skipped').length;
    const running = rows.filter((x) => x.health === 'running').length;
    const upcoming = rows
      .filter((x) => x.r.enabled && x.nextAt !== null && (now === null || x.nextAt >= now - 60_000))
      .sort((a, b) => a.nextAt! - b.nextAt!)[0];
    return {
      enabled,
      failing,
      skipped,
      running,
      upcoming,
      openclaw: rows.filter((x) => x.r.source === 'openclaw').length,
      launchd: rows.filter((x) => x.r.source === 'launchd').length,
    };
  }, [rows, now]);

  const visible = rows.filter((x) =>
    filter === 'all' ? true : filter === 'failing' ? x.health === 'failing' : x.r.source === filter,
  );
  const hit = (x: Row) => matchesQuery(query, x.r.name, x.r.schedule, x.r.agent, x.r.source, x.r.lastError, HEALTH[x.health].label);
  const scheduled = rows.filter((x) => x.hours.length > 0);
  // Jobs with no hour on the weekly grid: repeating ones (interval / keep-alive / on demand) vs calendar jobs the
  // grid can't show (the server's cadence: yearly, monthly-only, mixed entries).
  const offGrid = rows.filter((x) => x.hours.length === 0);
  const calendarOnly = offGrid.filter((x) => isCalendarCadence(x.r));
  const intervals = offGrid.filter((x) => !isCalendarCadence(x.r));
  const nowDay = now !== null ? JS_DAY_TO_DAY[new Date(now).getDay()] : null;
  const nowHour = now !== null ? new Date(now).getHours() : null;

  const gate = apiGate(api, { loading: 'READING CRON + LAUNCHD…', error: 'ROUTINES UNAVAILABLE' });
  if (gate) return <div className="h-full w-full">{gate}</div>;
  if (!rows.length)
    return (
      <ViewState
        kind="empty"
        title="NO ROUTINES FOUND"
        detail="No OpenClaw cron jobs (~/.openclaw/cron) or user LaunchAgents (~/Library/LaunchAgents) were found."
        onRetry={api.reload}
      />
    );

  const FILTERS: { id: Filter; label: string; n: number }[] = [
    { id: 'all', label: 'All', n: rows.length },
    { id: 'openclaw', label: 'OpenClaw', n: stats.openclaw },
    { id: 'launchd', label: 'launchd', n: stats.launchd },
    { id: 'failing', label: 'Failing', n: stats.failing },
  ];

  return (
    <div className="hud-scroll h-full w-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-5 px-5 py-5">
        {/* ── Summary strip ── */}
        <section className="hud-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_1.6fr]">
          <Big label="TOTAL JOBS" value={formatInt(rows.length)} sub={`${stats.openclaw} OpenClaw · ${stats.launchd} launchd`} />
          <Big label="ENABLED" value={formatInt(stats.enabled)} sub={stats.running ? `${stats.running} launchd job${stats.running === 1 ? '' : 's'} running now` : 'none running now'} accent="text-green" />
          <Big
            label="FAILING"
            value={formatInt(stats.failing)}
            sub={stats.failing ? 'last run errored' : 'all last runs clean'}
            accent={stats.failing ? 'text-red-400' : 'text-secondary'}
            alert={stats.failing > 0}
          />
          <Big label="SKIPPED" value={formatInt(stats.skipped)} sub="last run skipped" accent={stats.skipped ? 'text-amber' : 'text-secondary'} />
          <div className="rounded-lg border border-subtle bg-panel-elevated px-3 py-2">
            <div className="flex items-center gap-1.5 font-mono text-[8.5px] tracking-widest text-muted">
              <CalendarClock size={10} /> NEXT RUN
            </div>
            {stats.upcoming ? (
              <>
                <div className="truncate font-doto text-[22px] font-bold leading-tight text-orange">{relTime(isoOf(stats.upcoming.nextAt), now)}</div>
                <div className="truncate font-mono text-[9.5px] text-secondary" title={stats.upcoming.r.name}>
                  {stats.upcoming.r.name} · {clockLabel(isoOf(stats.upcoming.nextAt), now)}
                  {stats.upcoming.nextFromPlist && <span className="text-muted"> · from plist</span>}
                </div>
              </>
            ) : (
              <>
                <div className="font-doto text-[22px] font-bold leading-tight text-secondary">—</div>
                <div className="font-mono text-[9.5px] text-muted">no upcoming run reported</div>
              </>
            )}
          </div>
        </section>

        {/* ── Cards ── */}
        <section>
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <Zap size={14} className="text-orange" />
            <span className="hud-label">JOBS · FAILING FIRST, THEN NEXT RUN</span>
            <div className="ml-auto flex items-center gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'inline-flex h-6 items-center gap-1.5 rounded-full px-3 font-mono text-[10px] font-semibold tracking-wide transition-colors',
                    filter === f.id
                      ? f.id === 'failing'
                        ? 'bg-red-500 text-obsidian'
                        : 'bg-paper text-obsidian'
                      : 'border border-subtle text-secondary hover:text-paper',
                  )}
                >
                  {f.label}
                  <span className={cn('text-[9px]', filter === f.id ? 'text-obsidian/70' : f.id === 'failing' && f.n ? 'text-red-400' : 'text-muted')}>{f.n}</span>
                </button>
              ))}
            </div>
          </div>
          {visible.length === 0 ? (
            <div className="hud-card">
              <ViewState kind="empty" title={filter === 'failing' ? 'NOTHING FAILING' : 'NO JOBS IN THIS FILTER'} minH="min-h-[140px]" />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((x) => (
                <RoutineCard
                  key={x.r.id}
                  row={x}
                  now={now}
                  dim={!hit(x)}
                  hovered={hoverId === x.r.id}
                  onHover={setHoverId}
                  errOpen={!!openErr[x.r.id]}
                  onToggleErr={() => setOpenErr((m) => ({ ...m, [x.r.id]: !m[x.r.id] }))}
                />
              ))}
            </div>
          )}
          {api.error && <div className="mt-2 font-mono text-[10px] text-amber">Refresh failed ({api.error}) — showing the last good data.</div>}
          {api.data?.warnings?.map((w) => (
            <div key={w} className="mt-2 font-mono text-[10px] text-amber">
              {w}
            </div>
          ))}
        </section>

        {/* ── Weekly matrix + interval jobs ── */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="hud-card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Timer size={14} className="text-orange" />
              <span className="hud-label">WEEKLY SCHEDULE · HOURS AS CONFIGURED</span>
              <span className="ml-auto flex flex-wrap items-center gap-3 font-mono text-[9.5px] text-secondary">
                <LegendChip style={chipStyle('openclaw', 'ok')} label="OPENCLAW" />
                <LegendChip style={chipStyle('launchd', 'ok')} label="LAUNCHD" />
                <LegendChip style={chipStyle('openclaw', 'failing')} label="FAILING" />
                <LegendChip style={chipStyle('openclaw', 'skipped')} label="SKIPPED" />
                <span className="text-muted">{scheduled.length} timed jobs</span>
              </span>
            </div>
            <div className="grid grid-cols-[46px_repeat(7,minmax(0,1fr))] gap-px overflow-hidden rounded-lg border border-subtle bg-subtle">
              <div className="bg-panel" />
              {DAYS.map((d) => (
                <div
                  key={d}
                  className={cn('bg-panel py-1.5 text-center font-mono text-[10px] font-semibold tracking-widest', d === nowDay ? 'text-orange' : 'text-secondary')}
                >
                  {d}
                </div>
              ))}
              {HOURS.map((h) => {
                const inHour = scheduled.filter((x) => x.hours.includes(h));
                return (
                  <HourRow
                    key={h}
                    h={h}
                    rows={inHour}
                    current={h === nowHour}
                    nowDay={nowDay}
                    hoverId={hoverId}
                    setHoverId={setHoverId}
                    hit={hit}
                  />
                );
              })}
            </div>
          </section>

          <div className="flex flex-col gap-4">
            <SideList
              icon={<InfinityIcon size={14} className="text-orange" />}
              title="INTERVAL · KEEP-ALIVE"
              rows={intervals}
              now={now}
              hoverId={hoverId}
              setHoverId={setHoverId}
              hit={hit}
            />
            {calendarOnly.length > 0 && (
              <SideList
                icon={<CalendarClock size={14} className="text-orange" />}
                title="CALENDAR · OFF THE WEEKLY GRID"
                hint="Yearly, monthly-only or mixed calendar schedules — not shown on the weekly grid."
                rows={calendarOnly}
                now={now}
                hoverId={hoverId}
                setHoverId={setHoverId}
                hit={hit}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Side panel list for jobs that aren't on the weekly grid. */
function SideList({
  icon,
  title,
  hint,
  rows,
  now,
  hoverId,
  setHoverId,
  hit,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  rows: Row[];
  now: number | null;
  hoverId: string | null;
  setHoverId: (id: string | null) => void;
  hit: (x: Row) => boolean;
}) {
  return (
    <section className="hud-card flex flex-col p-4">
      <div className="mb-3 flex items-center gap-2" title={hint}>
        {icon}
        <span className="hud-label">{title}</span>
        <span className="ml-auto font-mono text-[10px] text-muted">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <ViewState kind="empty" title="NONE" minH="min-h-[120px]" />
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((x) => {
            const nextIso = isoOf(x.nextAt);
            const sub = `${x.r.schedule}${
              nextIso
                ? ` · next ${relTime(nextIso, now)}${x.nextFromPlist ? ' · from plist' : ''}`
                : x.r.running
                  ? ` · pid ${x.r.pid ?? '?'}`
                  : ''
            }`;
            return (
              <div
                key={x.r.id}
                onMouseEnter={() => setHoverId(x.r.id)}
                onMouseLeave={() => setHoverId(null)}
                className={cn(
                  'flex items-center gap-2 rounded-md border bg-panel-elevated px-2.5 py-1.5 transition-all duration-200',
                  hoverId === x.r.id ? 'border-highlight' : 'border-subtle',
                  hit(x) ? '' : 'opacity-30',
                )}
              >
                <span
                  className={cn('h-2 w-2 shrink-0 rounded-full', x.health === 'running' && 'robo-pulse')}
                  style={{ background: HEALTH[x.health].color }}
                  title={HEALTH[x.health].label}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[11px] font-semibold text-paper" title={x.r.name}>
                    {x.r.name}
                  </div>
                  <div className="truncate font-mono text-[9.5px] text-muted" title={nextIso ? `${sub}\n${clockLabel(nextIso, now)}` : sub}>
                    {sub}
                  </div>
                </div>
                <span
                  className="shrink-0 rounded-full border px-1.5 py-px font-mono text-[8px] font-semibold tracking-widest"
                  style={{ borderColor: `${SOURCE_COLOR[x.r.source]}66`, color: SOURCE_COLOR[x.r.source] }}
                >
                  {x.r.source === 'openclaw' ? 'OC' : 'LD'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RoutineCard({
  row,
  now,
  dim,
  hovered,
  onHover,
  errOpen,
  onToggleErr,
}: {
  row: Row;
  now: number | null;
  dim: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  errOpen: boolean;
  onToggleErr: () => void;
}) {
  const { r, health, exit } = row;
  const hs = HEALTH[health];
  // launchd job alive now whose previous instance exited non-zero (e.g. -15 = SIGTERM on restart).
  const restarted = health === 'running' && exit !== null && exit !== 0;
  const exitText = (code: number) => `exit ${code}${SIGNAL_NAMES[code] ? ` (${SIGNAL_NAMES[code]})` : ''}`;
  const lastLabel =
    r.lastRunAt !== null
      ? relTime(r.lastRunAt, now)
      : r.source === 'launchd' && exit !== null
        ? `exit ${exit}`
        : r.source === 'launchd' && r.lastStatus === 'error'
          ? 'last exit ≠ 0'
          : 'never';
  const nextIso = isoOf(row.nextAt);
  return (
    <article
      onMouseEnter={() => onHover(r.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        'hud-card relative overflow-hidden p-3.5 transition-all duration-300',
        dim ? 'opacity-30' : 'opacity-100',
        hovered && 'border-highlight bg-panel-elevated',
        health === 'failing' && 'border-red-500/40',
      )}
    >
      <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: hs.color }} />
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold text-paper" title={r.name}>
            {r.name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-full border px-1.5 py-px font-mono text-[8.5px] font-semibold tracking-widest"
              style={{ borderColor: `${SOURCE_COLOR[r.source]}66`, color: SOURCE_COLOR[r.source] }}
            >
              {r.source === 'openclaw' ? 'OPENCLAW' : 'LAUNCHD'}
            </span>
            {r.agent && (
              <span className="rounded-full border border-subtle px-1.5 py-px font-mono text-[8.5px] font-semibold tracking-wider text-secondary">
                agent · {r.agent}
              </span>
            )}
            <span className="flex min-w-0 items-center gap-1 font-mono text-[10px] text-muted">
              <Timer size={10} className="shrink-0" />
              <span className="truncate" title={r.schedule}>
                {r.schedule}
              </span>
            </span>
          </div>
        </div>
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 font-mono text-[8.5px] font-bold tracking-widest', hs.text, hs.border, hs.bg)}>
          {health === 'running' && r.pid ? `RUNNING · ${r.pid}` : hs.label}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Cell
          label="LAST RUN"
          value={lastLabel}
          sub={r.lastRunAt ? (r.lastStatus ?? '—') : r.running ? 'alive now' : exit !== null ? (SIGNAL_NAMES[exit] ?? (exit === 0 ? 'clean exit' : 'non-zero exit')) : undefined}
          tone={health === 'failing' ? 'text-red-400' : health === 'stopped' ? 'text-amber' : undefined}
        />
        <Cell
          label={row.nextFromPlist ? 'NEXT (FROM PLIST)' : 'NEXT RUN'}
          value={nextIso ? relTime(nextIso, now) : isKeepAlive(r) ? 'keep-alive' : '—'}
          sub={nextIso ? clockLabel(nextIso, now) : undefined}
          tone="text-orange"
        />
        <Cell
          label="ERRORS IN A ROW"
          value={String(r.consecutiveErrors)}
          tone={r.consecutiveErrors > 0 ? 'text-red-400' : 'text-secondary'}
          sub={r.consecutiveErrors >= 3 ? 'needs attention' : undefined}
        />
      </div>

      {restarted && (
        <div className="mt-2.5 flex items-center gap-1.5 rounded-md border border-amber/30 bg-amber/5 px-2 py-1.5 font-mono text-[10px] text-amber">
          <RotateCcw size={11} className="shrink-0" />
          <span className="truncate" title={`The previous instance ended with ${exitText(exit!)}; launchd restarted it and it is running now.`}>
            restarted · last {exitText(exit!)} · alive now
          </span>
        </div>
      )}
      {r.lastError && !restarted && (
        <div className={cn('mt-2.5 rounded-md border', health === 'failing' ? 'border-red-500/30 bg-red-500/5' : 'border-amber/30 bg-amber/5')}>
          <button type="button" onClick={onToggleErr} className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left" aria-expanded={errOpen}>
            <AlertOctagon size={11} className={cn('shrink-0', health === 'failing' ? 'text-red-400' : 'text-amber')} />
            <span className={cn('min-w-0 flex-1 font-mono text-[10px] text-secondary', !errOpen && 'truncate')}>
              {errOpen ? 'Last error' : r.lastError}
            </span>
            <ChevronDown size={12} className={cn('shrink-0 text-muted transition-transform', errOpen && 'rotate-180')} />
          </button>
          {errOpen && (
            <pre className="selectable hud-scroll max-h-40 overflow-auto whitespace-pre-wrap break-words border-t border-subtle px-2 py-1.5 font-mono text-[10px] leading-relaxed text-paper">
              {r.lastError}
            </pre>
          )}
        </div>
      )}
    </article>
  );
}

function HourRow({
  h,
  rows,
  current,
  nowDay,
  hoverId,
  setHoverId,
  hit,
}: {
  h: number;
  rows: Row[];
  current: boolean;
  nowDay: Day | null;
  hoverId: string | null;
  setHoverId: (id: string | null) => void;
  hit: (x: Row) => boolean;
}) {
  return (
    <>
      <div className={cn('flex items-center justify-end bg-panel pr-2 font-mono text-[9.5px]', current ? 'text-orange' : rows.length ? 'text-secondary' : 'text-muted/60')}>
        {pad2(h)}:00
      </div>
      {DAYS.map((d) => {
        const here = rows.filter((x) => x.days.includes(d));
        return (
          <div
            key={d}
            className={cn('flex flex-col gap-0.5 p-0.5', rows.length ? 'min-h-[24px]' : 'min-h-[12px]', current && d === nowDay ? 'bg-orange/10' : 'bg-obsidian')}
          >
            {here.map((x) => {
              const dim = (hoverId && hoverId !== x.r.id) || !hit(x);
              return (
                <div
                  key={x.r.id}
                  onMouseEnter={() => setHoverId(x.r.id)}
                  onMouseLeave={() => setHoverId(null)}
                  title={`${x.r.name}\n${d} ${pad2(h)}:${pad2(x.minute)} · ${x.r.schedule}\n${HEALTH[x.health].label}${x.r.lastError ? ` · ${x.r.lastError}` : ''}`}
                  className={cn('flex min-h-[18px] min-w-0 items-center gap-1 rounded px-1.5 transition-opacity duration-200', dim ? 'opacity-25' : 'opacity-100')}
                  style={chipStyle(x.r.source, x.health)}
                >
                  <span className="shrink-0 font-mono text-[8px] text-muted">:{pad2(x.minute)}</span>
                  <span className={cn('truncate font-mono text-[9px] font-semibold', x.health === 'failing' ? 'text-red-300' : 'text-paper')}>{shortName(x.r.name)}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

/** Matrix chip look: healthy jobs are tinted by source, failing ones red, skipped / stopped / disabled hatched. */
function chipStyle(source: RealRoutine['source'], health: Health): CSSProperties {
  const ok = health === 'ok' || health === 'running' || health === 'idle';
  const c = HEALTH[health].color;
  return {
    background: ok ? `${SOURCE_COLOR[source]}2e` : health === 'failing' ? `${c}33` : `repeating-linear-gradient(45deg, ${c}40 0 5px, ${c}14 5px 10px)`,
    border: `1px solid ${ok ? `${SOURCE_COLOR[source]}99` : c}`,
  };
}

function LegendChip({ style, label }: { style: CSSProperties; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-3.5 rounded-sm" style={style} /> {label}
    </span>
  );
}

function Big({ label, value, sub, accent, alert }: { label: string; value: string; sub: string; accent?: string; alert?: boolean }) {
  return (
    <div className={cn('rounded-lg border bg-panel-elevated px-3 py-2', alert ? 'border-red-500/40' : 'border-subtle')}>
      <div className="flex items-center gap-1.5 font-mono text-[8.5px] tracking-widest text-muted">
        {alert && <Activity size={10} className="text-red-400" />}
        {label}
      </div>
      <div className={cn('font-doto text-[24px] font-bold leading-tight', accent ?? 'text-paper')}>{value}</div>
      <div className="truncate font-mono text-[9.5px] text-muted">{sub}</div>
    </div>
  );
}

function Cell({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[8px] tracking-widest text-muted">{label}</div>
      <div className={cn('truncate font-doto text-[15px] font-bold leading-tight', tone ?? 'text-paper')}>{value}</div>
      {sub && <div className="truncate font-mono text-[9px] text-muted">{sub}</div>}
    </div>
  );
}

export default RoutinesAnalyticsView;
