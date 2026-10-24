import 'server-only';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { LaunchAgentHealth, LaunchAgentState, ServiceProcess } from '@/types/systems';
import { cached } from '@/lib/server/sources/cache';
import { BIN, HOME, redact, run, tilde } from './run';

// Host-level facts shared by every probe: who listens on which port (lsof), process uptime/RSS (ps), LaunchAgent
// state (launchctl list) and a few plist facts. All read-only and cheap (~20–80 ms each).

export const AGENTS_DIR = path.join(HOME, 'Library', 'LaunchAgents');

export interface Listener {
  pid: number;
  name: string;
  addrs: string[];
}

/** port → owning process + bound addresses, from one `lsof` call. */
export async function listeners(): Promise<Map<number, Listener>> {
  const out = new Map<number, Listener>();
  const r = await run(BIN.lsof, ['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcn'], 4_000);
  let pid = 0;
  let name = '';
  for (const line of r.stdout.split('\n')) {
    const tag = line[0];
    const val = line.slice(1);
    if (tag === 'p') pid = Number(val);
    else if (tag === 'c') name = val;
    else if (tag === 'n' && pid) {
      const m = val.match(/:(\d+)$/);
      if (!m) continue;
      const port = Number(m[1]);
      const cur = out.get(port);
      if (cur && cur.pid === pid) {
        if (!cur.addrs.includes(val)) cur.addrs.push(val);
      } else if (!cur) {
        out.set(port, { pid, name, addrs: [val] });
      }
    }
  }
  return out;
}

/** loopback = only 127.0.0.1 / ::1; all-interfaces = bound to * (reachable from the LAN / tailnet). */
export function bindOf(l: Listener | undefined): 'loopback' | 'all-interfaces' | null {
  if (!l) return null;
  return l.addrs.some((a) => a.startsWith('*:') || a.startsWith('0.0.0.0:') || a.startsWith('[::]:')) ? 'all-interfaces' : 'loopback';
}

/** "[[dd-]hh:]mm:ss" → seconds. */
function etimeSec(s: string): number | null {
  const m = s.trim().match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 86_400 + Number(m[2] ?? 0) * 3_600 + Number(m[3]) * 60 + Number(m[4]);
}

/**
 * `ps comm` → display name. comm can be a title the program set itself ("omniroute (v16.3.8)"), and a program that
 * sets its title to its command line would expose its arguments: cut at the first " -…" flag, reduce a path to its
 * basename, then redact and cap whatever is left.
 */
function processName(comm: string): string {
  const head = comm.trim().split(/\s+(?=-)/)[0];
  return redact((head.startsWith('/') ? path.basename(head) : head).split(HOME).join('~'), 80) || '?';
}

/** Uptime, RSS and executable name for the given PIDs (one `ps` call; dead PIDs are simply absent). */
export async function processes(pids: number[]): Promise<Map<number, ServiceProcess>> {
  const out = new Map<number, ServiceProcess>();
  const list = [...new Set(pids.filter((p) => Number.isInteger(p) && p > 0))];
  if (!list.length) return out;
  const r = await run(BIN.ps, ['-o', 'pid=,etime=,rss=,comm=', '-p', list.join(',')], 3_000);
  for (const line of r.stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+(\d+)\s+(.+)$/);
    if (!m) continue;
    out.set(Number(m[1]), {
      pid: Number(m[1]),
      name: processName(m[4]),
      uptimeSec: etimeSec(m[2]),
      rssBytes: Number(m[3]) * 1024,
    });
  }
  return out;
}

export interface LaunchdEntry {
  pid: number | null;
  status: number;
}

/** Every loaded job in the user's launchd domain: label → { pid, last exit status }. */
export async function launchdList(): Promise<Map<string, LaunchdEntry> | null> {
  const r = await run(BIN.launchctl, ['list'], 4_000);
  if (r.code !== 0 && !r.stdout) return null;
  const out = new Map<string, LaunchdEntry>();
  for (const line of r.stdout.split('\n').slice(1)) {
    const [pid, status, label] = line.split('\t');
    if (label) out.set(label.trim(), { pid: pid === '-' ? null : Number(pid), status: Number(status) || 0 });
  }
  return out;
}

interface PlistFacts {
  schedule: LaunchAgentState['schedule'];
  logPath: string | null;
  /** package.json versions of node packages the job runs (from ProgramArguments paths; args are never returned). */
  packages: Record<string, string>;
}

const PLIST_TTL_MS = 5 * 60_000;

async function readPlist(label: string): Promise<PlistFacts | null> {
  const file = path.join(AGENTS_DIR, `${label}.plist`);
  if (!fs.existsSync(file)) return null;
  const r = await run(BIN.plutil, ['-convert', 'json', '-o', '-', file], 3_000);
  if (r.code !== 0) return { schedule: null, logPath: null, packages: {} };
  let p: {
    KeepAlive?: unknown;
    StartInterval?: unknown;
    StartCalendarInterval?: unknown;
    RunAtLoad?: unknown;
    ProgramArguments?: unknown;
    Program?: unknown;
    StandardErrorPath?: unknown;
    StandardOutPath?: unknown;
  };
  try {
    p = JSON.parse(r.stdout);
  } catch {
    return { schedule: null, logPath: null, packages: {} };
  }
  const log = [p.StandardErrorPath, p.StandardOutPath].find((x): x is string => typeof x === 'string' && x.startsWith('/') && x !== '/dev/null');
  const schedule: PlistFacts['schedule'] = p.KeepAlive
    ? 'keep-alive'
    : p.StartInterval
      ? 'interval'
      : p.StartCalendarInterval
        ? 'calendar'
        : p.RunAtLoad
          ? 'at-load'
          : 'on-demand';
  const packages: Record<string, string> = {};
  const args = [...(Array.isArray(p.ProgramArguments) ? p.ProgramArguments : []), p.Program].filter((a): a is string => typeof a === 'string');
  for (const a of args) {
    const m = a.match(/^(\/.*\/node_modules\/((?:@[^/]+\/)?[^/]+))\//);
    if (!m || packages[m[2]]) continue;
    try {
      const pkg = JSON.parse(await fsp.readFile(path.join(m[1], 'package.json'), 'utf8')) as { version?: unknown };
      if (typeof pkg.version === 'string') packages[m[2]] = pkg.version;
    } catch {
      // package moved — no version
    }
  }
  return { schedule, logPath: log ? tilde(log) : null, packages };
}

export type PlistMap = Map<string, PlistFacts | null>;

/** Plist facts (schedule kind + package versions) for a fixed label set, cached 5 min under one key. */
export function plistFacts(labels: string[]): Promise<PlistMap> {
  const list = [...new Set(labels.filter((l) => !l.endsWith('*')))].sort();
  return cached(`systems:plists`, PLIST_TTL_MS, async () => {
    const entries = await Promise.all(list.map(async (l) => [l, await readPlist(l)] as const));
    return new Map(entries);
  }).catch(() => new Map());
}

const SIGNALLED = new Set([-15, -9]);

export interface AgentOpts {
  /** Registered by an app (login item / Docker Desktop) with no plist: only listed by launchd while the app runs. */
  appManaged?: boolean;
  /** Shown instead of the raw label when a prefix label ("…*") matches nothing. */
  name?: string;
}

/**
 * Combine launchctl + plist into one row. `label` may end in "*" to match a prefix (Docker Desktop's job, whose
 * label carries per-install ids); prefix labels are always app-managed.
 */
export function agentState(label: string, role: string, ld: Map<string, LaunchdEntry> | null, plists: PlistMap, opts: AgentOpts = {}): LaunchAgentState {
  const isPrefix = label.endsWith('*');
  const appManaged = isPrefix || !!opts.appManaged;
  let real = label;
  if (isPrefix) {
    const prefix = label.slice(0, -1);
    real = (ld ? [...ld.keys()].find((k) => k.startsWith(prefix)) : undefined) ?? opts.name ?? label;
  }
  const facts = isPrefix ? null : (plists.get(real) ?? null);
  const entry = ld?.get(real) ?? null;
  let health: LaunchAgentHealth;
  if (!entry) health = facts ? 'not-loaded' : appManaged ? 'app-not-running' : 'missing';
  else if (entry.pid != null) health = 'running';
  else if (entry.status === 0) health = 'idle';
  else if (SIGNALLED.has(entry.status)) health = 'stopped';
  else health = 'failing';
  return {
    label: real,
    role,
    plist: !!facts,
    appManaged,
    schedule: facts?.schedule ?? null,
    loaded: !!entry,
    pid: entry?.pid ?? null,
    lastExit: entry ? entry.status : null,
    health,
    logPath: facts?.logPath ?? null,
  };
}
