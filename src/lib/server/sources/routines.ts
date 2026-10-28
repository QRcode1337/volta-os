import 'server-only';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { RealRoutine, RoutineCadence, RoutineHealth } from '@/types/sources';
import { BIN, bin, run } from '../proc';
import { cached } from './cache';

// Real scheduled jobs: OpenClaw cron jobs + the user's LaunchAgents. Read-only (never loads/unloads anything).

const AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
// LaunchAgents worth showing (the user's own automation, not vendor updaters).
const LABEL_PREFIXES = ['com.unvolta.', 'ai.openclaw.', 'ai.hermes.', 'ai.omniroute.', 'com.omniroute.', 'com.local.', 'com.patrick.'];
const DOW: RealRoutine['days'] = ['SU', 'M', 'T', 'W', 'TH', 'F', 'SA'];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// `openclaw cron list` is a ~2.5 s, ~350 MB Node process: refresh it rarely, in the background (cache.ts
// serves the last list meanwhile), at low CPU priority, and only when a request asks for routines.
const OPENCLAW_TTL_MS = 5 * 60_000;
const OPENCLAW_MAX_STALE_MS = 30 * 60_000;
const LAUNCHD_TTL_MS = 60_000; // launchctl + plutil is ~80 ms; keeps running/exit status fresh
// The dev server's LaunchAgent PATH has no ~/bin, where the OpenClaw wrapper lives, so resolve the binary explicitly.
const OPENCLAW_BIN =
  process.env.OPENCLAW_BIN ?? bin('openclaw', [path.join(os.homedir(), 'bin/openclaw'), path.join(os.homedir(), '.local/bin/openclaw'), '/opt/homebrew/bin/openclaw']);

interface OpenClawJob {
  id: string;
  name?: string;
  displayName?: string;
  agentId?: string;
  enabled?: boolean;
  schedule: { kind: 'every' | 'cron' | string; everyMs?: number; expr?: string; tz?: string };
  state?: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: string;
    lastError?: string;
    consecutiveErrors?: number;
  };
}

/** One StartCalendarInterval entry; a missing key is a wildcard (launchd.plist(5)). */
type CalEntry = { Minute?: number; Hour?: number; Day?: number; Weekday?: number; Month?: number };

type Routine = Omit<RealRoutine, 'nextRunAt' | 'nextRunSource'> & { nextRunAt?: string | null };
type LaunchdRoutine = { routine: Routine; cal: CalEntry[]; logPaths: string[] };

function humanEvery(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `every ${m}m`;
  const h = m / 60;
  return Number.isInteger(h) ? `every ${h}h` : `every ${Math.round(h * 10) / 10}h`;
}

/** Simple 5-field cron → first hour + weekdays (best effort for the weekly matrix). */
function cronShape(expr: string): { hour: number | null; days: RealRoutine['days'] } {
  const [, hour, , , dow] = expr.trim().split(/\s+/);
  const h = hour && /^\d+/.test(hour) ? Number(hour.match(/^\d+/)![0]) : null;
  let days: RealRoutine['days'] = [];
  if (dow && dow !== '*') {
    const set = new Set<number>();
    for (const part of dow.split(',')) {
      const [a, b] = part.split('-').map(Number);
      if (Number.isFinite(a)) for (let d = a; d <= (Number.isFinite(b) ? b : a); d++) set.add(d % 7);
    }
    days = [...set].sort().map((d) => DOW[d]);
  }
  return { hour: h, days };
}

function statusOf(s?: string): RealRoutine['lastStatus'] {
  if (!s) return null;
  if (s === 'ok' || s === 'success') return 'ok';
  if (s === 'skipped') return 'skipped';
  return 'error';
}

/** launchd reports a process killed by a signal as a negative status. */
const STOP_SIGNALS = new Set([-15, -9]); // SIGTERM, SIGKILL

/** The single health verdict every page shows. */
function healthOf(r: Pick<RealRoutine, 'enabled' | 'source' | 'running' | 'schedule' | 'exitCode' | 'lastStatus' | 'consecutiveErrors'>): RoutineHealth {
  if (!r.enabled) return 'disabled';
  if (r.source === 'launchd') {
    // Alive right now: a non-zero status belongs to the previous instance (e.g. -15 after a restart), not this one.
    if (r.running) return 'running';
    // A keep-alive daemon that was signalled (SIGTERM/SIGKILL) was stopped, it didn't fail.
    if (r.schedule === 'keep-alive') {
      if (r.exitCode !== null && STOP_SIGNALS.has(r.exitCode)) return 'stopped';
      // A service that should always be up but isn't is never "ok", whatever its last exit code was.
      return r.lastStatus === 'error' ? 'failing' : 'stopped';
    }
  }
  if (r.lastStatus === 'error' || r.consecutiveErrors > 0) return 'failing';
  if (r.lastStatus === 'skipped') return 'skipped';
  if (r.lastStatus === 'ok') return 'ok';
  return 'idle';
}

async function loadOpenclawJobs(): Promise<Routine[]> {
  const r = await run(BIN.nice, ['-n', '10', OPENCLAW_BIN, 'cron', 'list', '--json'], { timeoutMs: 20_000, maxBuffer: 8 * 1024 * 1024 });
  if (r.code !== 0) throw new Error(`openclaw cron list: ${r.error ?? `exit ${r.code}`}`);
  const jobs = (JSON.parse(r.stdout) as { jobs?: OpenClawJob[] }).jobs ?? [];
  return jobs.map((j) => {
    const isCron = j.schedule.kind === 'cron' && j.schedule.expr;
    const shape = isCron ? cronShape(j.schedule.expr!) : { hour: null, days: [] as RealRoutine['days'] };
    const base = {
      id: `openclaw:${j.id}`,
      name: j.displayName || j.name || j.id,
      source: 'openclaw' as const,
      schedule: isCron
        ? `cron ${j.schedule.expr}${j.schedule.tz ? ` (${j.schedule.tz})` : ''}`
        : j.schedule.everyMs
          ? humanEvery(j.schedule.everyMs)
          : j.schedule.kind,
      enabled: j.enabled !== false,
      running: null,
      pid: null,
      agent: j.agentId ?? null,
      lastRunAt: j.state?.lastRunAtMs ? new Date(j.state.lastRunAtMs).toISOString() : null,
      nextRunAt: j.state?.nextRunAtMs ? new Date(j.state.nextRunAtMs).toISOString() : null,
      lastStatus: statusOf(j.state?.lastStatus),
      lastError: j.state?.lastError ?? null,
      exitCode: null,
      consecutiveErrors: j.state?.consecutiveErrors ?? 0,
      hourOfDay: shape.hour,
      days: shape.days,
      cadence: (isCron ? 'cron' : j.schedule.everyMs ? 'interval' : 'on-demand') as RoutineCadence,
      logUpdatedAt: null,
    };
    return { ...base, health: healthOf(base) };
  });
}

let openclawFailedAt = 0;
let openclawError: string | null = null;

/** OpenClaw jobs; [] when the CLI is missing or the gateway is down (retried at most every OPENCLAW_TTL_MS). */
async function openclawJobs(): Promise<Routine[]> {
  if (Date.now() - openclawFailedAt < OPENCLAW_TTL_MS) return [];
  try {
    const jobs = await cached('routines:openclaw', OPENCLAW_TTL_MS, loadOpenclawJobs, { maxStaleMs: OPENCLAW_MAX_STALE_MS });
    openclawError = null;
    return jobs;
  } catch (err) {
    openclawFailedAt = Date.now();
    openclawError = (err as Error).message.split('\n')[0];
    console.error('[volta routines] `openclaw cron list` failed — showing launchd jobs only:', (err as Error).message);
    return [];
  }
}

const inRange = (v: number | undefined, lo: number, hi: number) => v === undefined || (Number.isInteger(v) && v >= lo && v <= hi);

function calEntries(raw: unknown): CalEntry[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  return list.filter(
    (c): c is CalEntry =>
      !!c &&
      typeof c === 'object' &&
      inRange((c as CalEntry).Minute, 0, 59) &&
      inRange((c as CalEntry).Hour, 0, 23) &&
      inRange((c as CalEntry).Day, 1, 31) &&
      inRange((c as CalEntry).Weekday, 0, 7) &&
      inRange((c as CalEntry).Month, 1, 12),
  );
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** How often one calendar entry fires (launchd.plist(5): a missing key is a wildcard). */
function cadenceOf(c: CalEntry): RoutineCadence {
  if (c.Month != null) return 'yearly'; // pinned to a month of the year (alone: every day of that month)
  if (c.Day != null) return 'monthly';
  if (c.Weekday != null) return 'weekly';
  return c.Hour != null ? 'daily' : 'hourly';
}

/** Entries that repeat within a week (no Day/Month pin), i.e. the ones a weekly matrix can show. */
const weeklyEntries = (cal: CalEntry[]) => cal.filter((c) => c.Day == null && c.Month == null);

function describeCal(c: CalEntry): string {
  const time = c.Hour != null ? `${p2(c.Hour)}:${c.Minute != null ? p2(c.Minute) : '**'}` : c.Minute != null ? `hourly :${p2(c.Minute)}` : 'every minute';
  const wd = c.Weekday != null ? WEEKDAY_NAMES[c.Weekday % 7] : null;
  // crontab rule: Day and Weekday both set → either one matches.
  const dayOrWd = c.Day != null && wd ? `day ${c.Day} or ${wd}` : c.Day != null ? `day ${c.Day}` : wd;
  if (c.Month != null) {
    const mon = MONTH_NAMES[c.Month - 1];
    if (c.Day != null && !wd) return `yearly ${mon} ${c.Day} ${time}`;
    return `${mon} ${dayOrWd ?? 'daily'} ${time}`;
  }
  if (c.Day != null) return `monthly ${dayOrWd} ${time}`;
  return `${wd ?? (c.Hour != null ? 'daily' : '')} ${time}`.trim();
}

/** Next local fire time of one entry (crontab semantics: Day and Weekday both set → either matches). */
function nextForEntry(c: CalEntry, now: number): number | null {
  const hours = c.Hour != null ? [c.Hour] : Array.from({ length: 24 }, (_, i) => i);
  const minutes = c.Minute != null ? [c.Minute] : Array.from({ length: 60 }, (_, i) => i);
  const today = new Date(now);
  for (let add = 0; add <= 4 * 366; add++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + add);
    if (c.Month != null && d.getMonth() + 1 !== c.Month) continue;
    const dayOk = c.Day != null ? d.getDate() === c.Day : null;
    const wdOk = c.Weekday != null ? d.getDay() === c.Weekday % 7 : null;
    if (dayOk !== null && wdOk !== null ? !dayOk && !wdOk : dayOk === false || wdOk === false) continue;
    for (const h of hours)
      for (const m of minutes) {
        const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
        if (t > now) return t;
      }
  }
  return null;
}

function nextCalendarFire(entries: CalEntry[], now: number): number | null {
  let best: number | null = null;
  for (const c of entries) {
    const t = nextForEntry(c, now);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

/** Newest mtime (ISO) of the given files; null when none exist. Only stats, never reads them. */
async function newestMtime(paths: string[]): Promise<string | null> {
  let best = 0;
  for (const p of paths) {
    try {
      best = Math.max(best, (await fsp.stat(p)).mtimeMs);
    } catch {
      // no log yet
    }
  }
  return best ? new Date(best).toISOString() : null;
}

async function loadLaunchdJobs(): Promise<LaunchdRoutine[]> {
  let files: string[];
  try {
    files = (await fsp.readdir(AGENTS_DIR)).filter((f) => f.endsWith('.plist') && LABEL_PREFIXES.some((p) => f.startsWith(p)));
  } catch {
    return [];
  }
  const loaded = new Map<string, { pid: number | null; status: number }>();
  const list = await run(BIN.launchctl, ['list'], { timeoutMs: 5_000 });
  // launchctl unavailable → nothing loaded; still list the plists
  if (list.code === 0) {
    for (const line of list.stdout.split('\n').slice(1)) {
      const [pid, status, label] = line.split('\t');
      if (label) loaded.set(label.trim(), { pid: pid === '-' ? null : Number(pid), status: Number(status) || 0 });
    }
  }
  // `launchctl list` prints status 0 for a job that has never exited; `launchctl print` says whether it ever ran.
  const uid = process.getuid?.() ?? 501;
  const ran = new Map<string, boolean>();
  await Promise.all(
    files
      .map((f) => f.replace(/\.plist$/, ''))
      .filter((label) => loaded.has(label))
      .map(async (label) => {
        const { stdout, code } = await run(BIN.launchctl, ['print', `gui/${uid}/${label}`], { timeoutMs: 3_000 });
        if (code !== 0) return; // unknown → fall back to the `launchctl list` status
        const runs = /^\s*runs = (\d+)/m.exec(stdout);
        const never = /^\s*last exit code = \(never exited\)/m.test(stdout);
        if (runs) ran.set(label, Number(runs[1]) > 0 && !never);
      }),
  );
  const out: LaunchdRoutine[] = [];
  for (const f of files) {
    const label = f.replace(/\.plist$/, '');
    let plist: {
      StartInterval?: number;
      StartCalendarInterval?: unknown;
      KeepAlive?: unknown;
      Disabled?: boolean;
      StandardOutPath?: unknown;
      StandardErrorPath?: unknown;
    } = {};
    try {
      const r = await run(BIN.plutil, ['-convert', 'json', '-o', '-', path.join(AGENTS_DIR, f)], { timeoutMs: 5_000 });
      if (r.code === 0) plist = JSON.parse(r.stdout);
    } catch {
      // unreadable plist — show it with an unknown schedule
    }
    const cal = plist.StartInterval ? [] : calEntries(plist.StartCalendarInterval);
    const schedule = plist.StartInterval
      ? humanEvery(plist.StartInterval * 1000)
      : cal.length
        ? `${describeCal(cal[0])}${cal.length > 1 ? ` (+${cal.length - 1} more)` : ''}`
        : plist.KeepAlive
          ? 'keep-alive'
          : 'on demand';
    const cadences = [...new Set(cal.map(cadenceOf))];
    const cadence: RoutineCadence = plist.StartInterval
      ? 'interval'
      : cal.length
        ? cadences.length === 1
          ? cadences[0]
          : 'mixed'
        : plist.KeepAlive
          ? 'keep-alive'
          : 'on-demand';
    // A yearly/monthly entry can't be drawn on a weekly matrix: only week-repeating entries give hour/days.
    const weekly = weeklyEntries(cal);
    const logPaths = [...new Set([plist.StandardOutPath, plist.StandardErrorPath].filter((x): x is string => typeof x === 'string' && path.isAbsolute(x)))];
    const logUpdatedAt = await newestMtime(logPaths);
    const l = loaded.get(label);
    // Loaded but never run/exited since load: there is no exit status to report (list's 0 is a placeholder).
    const neverRan = !!l && l.pid == null && ran.get(label) === false;
    const base = {
      id: `launchd:${label}`,
      name: label,
      source: 'launchd' as const,
      schedule,
      enabled: !!l && !plist.Disabled,
      running: l ? l.pid != null : false,
      pid: l?.pid ?? null,
      agent: null,
      lastRunAt: null,
      lastStatus: l && !neverRan ? (l.status === 0 ? ('ok' as const) : ('error' as const)) : null,
      lastError: neverRan ? null : l && l.status !== 0 ? `last exit status ${l.status}` : l ? null : 'not loaded',
      exitCode: l && !neverRan ? l.status : null,
      consecutiveErrors: 0,
      hourOfDay: weekly[0]?.Hour ?? null,
      // Every weekly entry pinned to a weekday → those days; otherwise it can fire any day.
      days:
        weekly.length && weekly.every((c) => c.Weekday != null)
          ? [...new Set(weekly.map((c) => c.Weekday! % 7))].sort().map((d) => DOW[d])
          : [],
      cadence,
      logUpdatedAt,
    };
    out.push({ routine: { ...base, health: healthOf(base) }, cal, logPaths });
  }
  return out;
}

function withPlistNextRun({ routine, cal }: LaunchdRoutine, now: number): RealRoutine {
  const next = routine.enabled && cal.length ? nextCalendarFire(cal, now) : null;
  return { ...routine, nextRunAt: next === null ? null : new Date(next).toISOString(), nextRunSource: next === null ? null : 'plist' };
}

export async function getRoutines(): Promise<RealRoutine[]> {
  const [oc, ld] = await Promise.all([openclawJobs(), cached('routines:launchd', LAUNCHD_TTL_MS, loadLaunchdJobs)]);
  const now = Date.now();
  const all: RealRoutine[] = [
    ...oc.map((r) => ({ ...r, nextRunAt: r.nextRunAt ?? null, nextRunSource: r.nextRunAt ? ('scheduler' as const) : null })),
    // Computed per request from the plist, so it never lags the cache.
    ...ld.map((x) => withPlistNextRun(x, now)),
  ];
  // Next run first; jobs without one (keep-alive services) last.
  return all.sort((x, y) => (x.nextRunAt ?? '9').localeCompare(y.nextRunAt ?? '9'));
}

/** Why the list may be incomplete (call after getRoutines). Empty when every source answered. */
export function routinesWarnings(): string[] {
  return openclawError ? [`OpenClaw cron jobs are missing: \`openclaw cron list\` failed (${openclawError}). Showing LaunchAgents only.`] : [];
}

export interface LaunchAgentState {
  routine: RealRoutine;
  /** The plist's StandardOutPath / StandardErrorPath (absolute), for callers that read a log tail. */
  logPaths: string[];
}

/** One of the user's LaunchAgents by label (shares the 60s launchd cache; never runs the OpenClaw CLI). */
export async function getLaunchAgent(label: string): Promise<LaunchAgentState | null> {
  const ld = await cached('routines:launchd', LAUNCHD_TTL_MS, loadLaunchdJobs);
  const hit = ld.find((x) => x.routine.name === label);
  return hit ? { routine: withPlistNextRun(hit, Date.now()), logPaths: hit.logPaths } : null;
}
