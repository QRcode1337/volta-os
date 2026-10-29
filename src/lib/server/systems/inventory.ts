import 'server-only';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { LaunchAgentHealth, LaunchAgentState, LaunchdJob, LaunchdScope, ListenerRow, SystemsInventory } from '@/types/systems';
import { cached } from '@/lib/server/sources/cache';
import { tilde } from '@/lib/server/storage';
import { redactSecrets } from '../redact';
import { BIN, mapLimit, run } from '../proc';
import { AGENTS_DIR, bindOf, etimeSec, launchdList, listeners, processName, type LaunchdEntry } from './host';

// GET /api/systems/inventory: every launchd job VOLTA can see (user, global and daemon plists + app-registered jobs)
// with enabled/disabled state, and every TCP listener with its PID, parent and owning job. Read-only; cached 15 s,
// plists 5 min. Apple's own jobs (com.apple.*) are left out unless a plist for them sits in the scanned folders.

const TTL_MS = 15_000;
const PLIST_TTL_MS = 5 * 60_000;
const UID = process.getuid?.() ?? 501;

const DIRS: { dir: string; scope: LaunchdScope }[] = [
  { dir: AGENTS_DIR, scope: 'user' },
  { dir: '/Library/LaunchAgents', scope: 'global-agent' },
  { dir: '/Library/LaunchDaemons', scope: 'daemon' },
];

interface PlistInfo {
  label: string;
  scope: LaunchdScope;
  file: string;
  program: string | null;
  schedule: LaunchAgentState['schedule'];
  disabledKey: boolean;
}

async function readPlist(file: string, scope: LaunchdScope): Promise<PlistInfo> {
  const fallback = path.basename(file, '.plist');
  const r = await run(BIN.plutil, ['-convert', 'json', '-o', '-', file], { timeoutMs: 3_000 });
  let p: Record<string, unknown> = {};
  try {
    if (r.code === 0) p = JSON.parse(r.stdout);
  } catch {
    // unreadable plist — label from the file name, no facts
  }
  const args = Array.isArray(p.ProgramArguments) ? p.ProgramArguments : [];
  const exe = [p.Program, args[0]].find((x): x is string => typeof x === 'string' && !!x);
  return {
    label: typeof p.Label === 'string' && p.Label ? p.Label : fallback,
    scope,
    file,
    program: exe ? redactSecrets(path.basename(exe)).slice(0, 80) : null,
    schedule: !Object.keys(p).length
      ? null
      : p.KeepAlive
        ? 'keep-alive'
        : p.StartInterval
          ? 'interval'
          : p.StartCalendarInterval
            ? 'calendar'
            : p.RunAtLoad
              ? 'at-load'
              : 'on-demand',
    disabledKey: p.Disabled === true,
  };
}

const allPlists = () =>
  cached('systems:inventory:plists', PLIST_TTL_MS, async () => {
    const files = (
      await Promise.all(
        DIRS.map(async ({ dir, scope }) => {
          const names = await fsp.readdir(dir).catch(() => [] as string[]);
          return names.filter((n) => n.endsWith('.plist')).map((n) => ({ file: path.join(dir, n), scope }));
        }),
      )
    ).flat();
    return mapLimit(files, 8, (f) => readPlist(f.file, f.scope));
  });

/** `launchctl print-disabled <domain>` → label → disabled. Handles both "=> disabled" and the older "=> true". */
async function disabledMap(domain: string): Promise<Map<string, boolean>> {
  const r = await run(BIN.launchctl, ['print-disabled', domain], { timeoutMs: 4_000 });
  const out = new Map<string, boolean>();
  for (const m of r.stdout.matchAll(/"([^"]+)"\s*=>\s*(\w+)/g)) out.set(m[1], m[2] === 'disabled' || m[2] === 'true');
  return out;
}

/** System-domain jobs from `launchctl print system` (no root needed): label → pid (0 = not running) + last exit. */
async function systemJobs(): Promise<Map<string, LaunchdEntry>> {
  const r = await run(BIN.launchctl, ['print', 'system'], { timeoutMs: 5_000, maxBuffer: 8 * 1024 * 1024 });
  const out = new Map<string, LaunchdEntry>();
  const block = r.stdout.match(/\n\tservices = \{\n([\s\S]*?)\n\t\}/)?.[1] ?? '';
  for (const line of block.split('\n')) {
    const m = line.trim().match(/^(\d+|-)\s+(\S+)\s+(\S+)$/);
    if (!m) continue;
    const pid = Number(m[1]);
    out.set(m[3], { pid: pid > 0 ? pid : null, status: /^-?\d+$/.test(m[2]) ? Number(m[2]) : 0 });
  }
  return out;
}

const SIGNALLED = new Set([-15, -9]);

function healthOf(entry: LaunchdEntry | undefined, hasPlist: boolean): LaunchAgentHealth {
  if (!entry) return hasPlist ? 'not-loaded' : 'missing';
  if (entry.pid != null) return 'running';
  if (entry.status === 0) return 'idle';
  return SIGNALLED.has(entry.status) ? 'stopped' : 'failing';
}

interface Proc {
  ppid: number;
  name: string;
  uptimeSec: number | null;
  rssBytes: number | null;
}

async function psInfo(pids: number[]): Promise<Map<number, Proc>> {
  const out = new Map<number, Proc>();
  const list = [...new Set(pids.filter((p) => Number.isInteger(p) && p > 0))];
  if (!list.length) return out;
  const r = await run(BIN.ps, ['-o', 'pid=,ppid=,etime=,rss=,comm=', '-p', list.join(',')], { timeoutMs: 3_000 });
  for (const line of r.stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(.+)$/);
    if (m) out.set(Number(m[1]), { ppid: Number(m[2]), name: processName(m[5]), uptimeSec: etimeSec(m[3]), rssBytes: Number(m[4]) * 1024 });
  }
  return out;
}

const HIDDEN = /^(com\.apple\.|application\.)/;
const SCOPE_ORDER: Record<LaunchdScope, number> = { user: 0, app: 1, 'global-agent': 2, daemon: 3 };

async function load(): Promise<SystemsInventory> {
  const t0 = Date.now();
  const [plists, gui, sys, guiDisabled, sysDisabled, ls] = await Promise.all([
    allPlists(),
    launchdList(),
    systemJobs(),
    disabledMap(`gui/${UID}`),
    disabledMap('system'),
    listeners(),
  ]);

  const jobs: LaunchdJob[] = [];
  const seen = new Set<string>();
  for (const p of plists) {
    const domain = p.scope === 'daemon' ? sys : gui;
    const disabled = (p.scope === 'daemon' ? sysDisabled : guiDisabled).get(p.label) ?? p.disabledKey;
    const entry = domain?.get(p.label);
    seen.add(p.label);
    jobs.push({
      label: p.label,
      scope: p.scope,
      plistPath: tilde(p.file),
      program: p.program,
      schedule: p.schedule,
      enabled: !disabled,
      loaded: !!entry,
      pid: entry?.pid ?? null,
      lastExit: entry ? entry.status : null,
      health: healthOf(entry, true),
      ports: [],
    });
  }
  // App-registered jobs (login items, SMAppService helpers): loaded in the user domain with no plist we can read.
  for (const [label, entry] of gui ?? []) {
    if (seen.has(label) || HIDDEN.test(label)) continue;
    seen.add(label);
    jobs.push({
      label,
      scope: 'app',
      plistPath: null,
      program: null,
      schedule: null,
      enabled: !guiDisabled.get(label),
      loaded: true,
      pid: entry.pid,
      lastExit: entry.status,
      health: healthOf(entry, false),
      ports: [],
    });
  }
  // Disabled overrides for jobs that are neither loaded nor installed any more are left out (stale entries).
  jobs.sort((a, b) => SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] || a.label.localeCompare(b.label));

  const labelByPid = new Map<number, string>();
  for (const j of jobs) if (j.pid) labelByPid.set(j.pid, j.label);

  const owners = [...ls.values()].map((l) => l.pid);
  const procs = await psInfo(owners);
  const parents = await psInfo([...procs.values()].map((p) => p.ppid));
  const rows: ListenerRow[] = [...ls.entries()]
    .map(([port, l]) => {
      const pr = procs.get(l.pid);
      const ppid = pr?.ppid ?? null;
      // The job's own PID, else its direct child (node → next-server, omniroute's wrapper → server).
      const owner = labelByPid.get(l.pid) ?? (ppid && ppid > 1 ? labelByPid.get(ppid) : undefined) ?? null;
      return {
        port,
        pid: l.pid,
        name: pr?.name ?? processName(l.name),
        ppid,
        parentName: ppid === 1 ? 'launchd' : ppid ? (parents.get(ppid)?.name ?? null) : null,
        bind: bindOf(l) ?? 'loopback',
        addrs: l.addrs,
        uptimeSec: pr?.uptimeSec ?? null,
        rssBytes: pr?.rssBytes ?? null,
        launchdLabel: owner,
      };
    })
    .sort((a, b) => a.port - b.port);
  const byLabel = new Map(jobs.map((j) => [j.label, j]));
  for (const r of rows) if (r.launchdLabel) byLabel.get(r.launchdLabel)?.ports.push(r.port);

  return {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    jobs,
    listeners: rows,
    notes: [
      'Listeners come from lsof without root, so ports held by root-owned daemons are not listed.',
      'Apple system jobs (com.apple.*) are hidden unless their plist sits in a scanned LaunchAgents/LaunchDaemons folder.',
    ],
  };
}

export const getInventory = () => cached('systems:inventory', TTL_MS, load);
