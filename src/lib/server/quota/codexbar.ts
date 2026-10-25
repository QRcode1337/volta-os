import 'server-only';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { redactSecrets } from '../redact';
import type { CodexBarSection, LimitsProvider, QuotaWindow } from './types';

// CodexBar (steipete) keeps no readable "current usage" file: its menu-bar app holds the live numbers in memory
// and only appends samples to ~/Library/Application Support/com.steipete.codexbar/history/<provider>.json while
// it runs. The supported read interface is its bundled CLI:
//   CodexBarCLI usage --provider <id> [--source web|cli|oauth|api] --json --no-color
// which prints a JSON array of { provider, source, usage: { primary, secondary, tertiary, extraRateWindows, details,
// loginMethod }, rateWindowLabels, pace, credits, error } and exits 1 (JSON still on stdout) when a provider fails.
// It is read-only (it fetches and prints; it writes nothing we rely on). When it fails or is too slow, the last
// sample CodexBar recorded in its history file stands in, marked source "history" and, if old, status "stale".

const CLI_CANDIDATES = [process.env.VOLTA_CODEXBAR_CLI ?? '', '/Applications/CodexBar.app/Contents/Helpers/CodexBarCLI'];
const HISTORY_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'com.steipete.codexbar', 'history');
/** Providers worth showing next to the OmniRoute subscriptions. `sources` are tried in order (null = CodexBar's own auto choice). */
const SPECS: { id: string; label: string; sources: (string | null)[]; timeoutMs: number }[] = [
  // claude --source cli currently fails ("Missing Current session") after ~35 s, so only the web source is tried.
  { id: 'claude', label: 'Claude', sources: ['web'], timeoutMs: 30_000 },
  { id: 'codex', label: 'Codex', sources: ['cli', null], timeoutMs: 25_000 },
  { id: 'cursor', label: 'Cursor', sources: [null], timeoutMs: 20_000 },
  { id: 'copilot', label: 'GitHub Copilot', sources: [null], timeoutMs: 20_000 },
  { id: 'antigravity', label: 'Antigravity', sources: [null], timeoutMs: 45_000 },
];
/** How long a build waits for one provider before reporting it "pending" (it keeps running and fills in next time). */
const DEADLINE_MS = 8_000;
const LIVE_RUNNING = 'live read still running';
const ERROR_BACKOFF_MS = 5 * 60_000;
/** A previous live reading younger than this is served as-is while the next one is still running. */
const LAST_GOOD_MS = 10 * 60_000;
/** A history sample older than this is shown as stale rather than current (the CodexBar app records one every few minutes while it runs). */
const HISTORY_FRESH_MS = 15 * 60_000;
const HISTORY_MAX_AGE_MS = 14 * 86_400_000;

export function codexbarCli(): string | null {
  return CLI_CANDIDATES.find((c) => c && fs.existsSync(c)) ?? null;
}

/** A clean child environment: CodexBar needs HOME and a sane PATH, not the secrets in this process's env. */
function childEnv(): NodeJS.ProcessEnv {
  return { NODE_ENV: 'production', HOME: os.homedir(), USER: process.env.USER ?? '', LANG: process.env.LANG ?? 'en_US.UTF-8', PATH: '/usr/bin:/bin:/usr/sbin:/sbin', TMPDIR: process.env.TMPDIR ?? '/tmp' };
}

function run(cli: string, args: string[], timeoutMs: number): Promise<{ stdout: string; code: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    execFile(cli, args, { timeout: timeoutMs, maxBuffer: 4 << 20, env: childEnv(), killSignal: 'SIGKILL' }, (err, stdout) => {
      if (!err) return resolve({ stdout, code: 0, timedOut: false });
      const e = err as NodeJS.ErrnoException & { killed?: boolean; code?: number | string; stdout?: string };
      resolve({ stdout: stdout || e.stdout || '', code: typeof e.code === 'number' ? e.code : null, timedOut: Boolean(e.killed) });
    });
  });
}

type RawWindow = { usedPercent?: unknown; windowMinutes?: unknown; resetsAt?: unknown; resetDescription?: unknown };
type RawEntry = {
  provider?: string;
  source?: string;
  error?: { message?: unknown };
  diagnostic?: unknown;
  usage?: {
    primary?: RawWindow | null;
    secondary?: RawWindow | null;
    tertiary?: RawWindow | null;
    extraRateWindows?: { id?: unknown; title?: unknown; window?: RawWindow; usageKnown?: unknown }[];
    details?: { title?: unknown; rows?: { label?: unknown; value?: unknown; secondaryValue?: unknown }[] }[];
    loginMethod?: unknown;
    updatedAt?: unknown;
  };
  rateWindowLabels?: Record<string, string>;
  pace?: Record<string, { summary?: unknown } | undefined>;
  credits?: { remaining?: unknown };
};

const pct = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null);
const iso = (v: unknown): string | null => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);
const text = (v: unknown, max = 120): string | null => (typeof v === 'string' && v.trim() ? redactSecrets(v.trim()).slice(0, max) : null);

function windowOf(id: string, label: string, w: RawWindow, pace?: string | null): QuotaWindow {
  const used = pct(w.usedPercent);
  return {
    id,
    label,
    usedPercent: used,
    remainingPercent: used === null ? null : Math.round((100 - used) * 10) / 10,
    windowMinutes: typeof w.windowMinutes === 'number' ? w.windowMinutes : null,
    resetsAt: iso(w.resetsAt),
    resetLabel: text(w.resetDescription, 60),
    exhausted: used !== null && used >= 100,
    pace: pace ?? null,
  };
}

const DEFAULT_LABELS: Record<string, string> = { primary: 'Session', secondary: 'Weekly', tertiary: 'Other' };

function normalise(id: string, label: string, entry: RawEntry, source: string): LimitsProvider {
  const u = entry.usage ?? {};
  const windows: QuotaWindow[] = [];
  for (const key of ['primary', 'secondary', 'tertiary'] as const) {
    const w = u[key];
    if (!w) continue;
    windows.push(windowOf(key, entry.rateWindowLabels?.[key] ?? DEFAULT_LABELS[key], w, text(entry.pace?.[key]?.summary, 140)));
  }
  for (const e of u.extraRateWindows ?? []) {
    if (e.window && e.usageKnown !== false) windows.push(windowOf(String(e.id ?? 'extra'), text(e.title, 40) ?? 'Extra', e.window));
  }
  const extras: { label: string; value: string }[] = [];
  for (const d of u.details ?? []) {
    for (const r of d.rows ?? []) {
      const l = text(r.label, 40);
      const v = text(r.value, 80);
      if (l && v) extras.push({ label: l, value: v });
    }
  }
  if (typeof entry.credits?.remaining === 'number' && !extras.some((x) => /credit/i.test(x.label))) extras.push({ label: 'Credits remaining', value: String(entry.credits.remaining) });
  return {
    id,
    label,
    plan: text(u.loginMethod, 40),
    source,
    status: 'ok',
    fetchedAt: iso(u.updatedAt) ?? new Date().toISOString(),
    windows,
    extras,
  };
}

/** Parse the CLI's stdout (a JSON array; tolerate log noise before it) and return the entry for `id`. */
function parseEntry(stdout: string, id: string): RawEntry | null {
  const start = stdout.indexOf('[');
  if (start < 0) return null;
  try {
    const arr = JSON.parse(stdout.slice(start)) as RawEntry[];
    return arr.find((e) => e.provider === id) ?? arr[0] ?? null;
  } catch {
    return null;
  }
}

// ── history fallback ────────────────────────────────────────────────────────────────────────────────────

interface HistoryWindow {
  name?: string;
  windowMinutes?: number;
  entries?: { capturedAt?: string; resetsAt?: string; usedPercent?: number }[];
}

function fromHistory(id: string, label: string, why: string): LimitsProvider | null {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, `${id}.json`), 'utf8')) as { accounts?: Record<string, HistoryWindow[]>; preferredAccountKey?: string };
    const accounts = Object.entries(j.accounts ?? {});
    if (accounts.length === 0) return null;
    // The account CodexBar prefers, else whichever recorded a sample most recently.
    const last = (ws: HistoryWindow[]) => Math.max(0, ...ws.map((w) => Date.parse(w.entries?.at(-1)?.capturedAt ?? '') || 0));
    const picked = accounts.find(([k]) => k === j.preferredAccountKey) ?? accounts.sort((a, b) => last(b[1]) - last(a[1]))[0];
    const windows: QuotaWindow[] = [];
    let newest = 0;
    for (const w of picked[1]) {
      const e = w.entries?.at(-1);
      const at = Date.parse(e?.capturedAt ?? '');
      if (!e || !Number.isFinite(at) || Date.now() - at > HISTORY_MAX_AGE_MS) continue;
      newest = Math.max(newest, at);
      const win = windowOf(w.name ?? 'window', (w.name ?? 'window').replace(/^./, (c) => c.toUpperCase()), { usedPercent: e.usedPercent, windowMinutes: w.windowMinutes, resetsAt: e.resetsAt });
      // A recorded reset time that has already passed means the sample describes a window that no longer exists.
      if (win.resetsAt && Date.parse(win.resetsAt) < Date.now()) {
        win.usedPercent = null;
        win.remainingPercent = null;
        win.exhausted = false;
        win.resetLabel = 'window already reset';
      }
      windows.push(win);
    }
    if (windows.length === 0) return null;
    const fresh = Date.now() - newest <= HISTORY_FRESH_MS;
    return { id, label, plan: null, source: 'history', status: fresh ? 'ok' : 'stale', fetchedAt: new Date(newest).toISOString(), windows, extras: [], error: why };
  } catch {
    return null;
  }
}

// ── live fetch with per-provider dedupe, a build deadline and a last-good memory ───────────────────────────

interface Slot {
  inflight: Promise<LimitsProvider> | null;
  startedAt: number;
  /** Last successful live reading. */
  last: LimitsProvider | null;
  /** Latest outcome of a finished read, errors included (what a build shows for a provider that missed its deadline). */
  outcome: LimitsProvider | null;
  outcomeAt: number;
}
const g = globalThis as typeof globalThis & { __voltaCodexbar?: Map<string, Slot> };
const slots = (g.__voltaCodexbar ??= new Map<string, Slot>());
const slot = (id: string): Slot => {
  let s = slots.get(id);
  if (!s) slots.set(id, (s = { inflight: null, startedAt: 0, last: null, outcome: null, outcomeAt: 0 }));
  return s;
};

async function fetchLive(cli: string, spec: (typeof SPECS)[number]): Promise<LimitsProvider> {
  let lastErr = 'no data';
  for (const source of spec.sources) {
    const args = ['usage', '--provider', spec.id, '--json', '--no-color', ...(source ? ['--source', source] : [])];
    const r = await run(cli, args, spec.timeoutMs);
    if (r.timedOut) {
      lastErr = `codexbar timed out after ${Math.round(spec.timeoutMs / 1000)}s (${source ?? 'auto'})`;
      continue;
    }
    const entry = parseEntry(r.stdout, spec.id);
    if (entry?.source === 'offline' || entry?.usage?.loginMethod === 'offline') {
      // e.g. Antigravity signed in with an OAuth client that cannot read its quota: CodexBar only has offline counts.
      lastErr = text(entry.diagnostic, 200) ?? 'CodexBar has no live usage for this provider (offline)';
      continue;
    }
    if (entry?.usage && !entry.error) return normalise(spec.id, spec.label, entry, entry.source ?? source ?? 'auto');
    lastErr = text(entry?.error?.message, 160) ?? `codexbar exited ${r.code ?? '?'} with no usage (${source ?? 'auto'})`;
  }
  throw new Error(lastErr);
}

function start(cli: string, spec: (typeof SPECS)[number]): Promise<LimitsProvider> {
  const s = slot(spec.id);
  if (s.inflight) return s.inflight;
  s.startedAt = Date.now();
  const p = fetchLive(cli, spec).then(
    (v) => {
      s.last = v;
      s.outcome = v;
      s.outcomeAt = Date.now();
      s.inflight = null;
      return v;
    },
    (err: Error) => {
      s.inflight = null;
      // Keep the last live reading (flagged stale) over a history sample; fall back to history; else report the error.
      const why = text(err.message, 200) ?? 'failed';
      const prev = s.last;
      const out: LimitsProvider = prev
        ? { ...prev, status: 'stale', error: why }
        : (fromHistory(spec.id, spec.label, why) ?? { id: spec.id, label: spec.label, plan: null, source: 'none', status: 'error', fetchedAt: null, windows: [], extras: [], error: why });
      s.outcome = out;
      s.outcomeAt = Date.now();
      return out;
    },
  );
  s.inflight = p;
  return p;
}

function pending(spec: (typeof SPECS)[number]): LimitsProvider {
  const s = slot(spec.id);
  if (!s.inflight && s.outcome) return s.outcome;
  if (s.last?.fetchedAt && s.last.status === 'ok' && Date.now() - Date.parse(s.last.fetchedAt) < LAST_GOOD_MS) return s.last;
  if (s.last) return { ...s.last, status: 'stale', error: LIVE_RUNNING };
  return fromHistory(spec.id, spec.label, LIVE_RUNNING) ?? { id: spec.id, label: spec.label, plan: null, source: 'none', status: 'pending', fetchedAt: null, windows: [], extras: [], error: LIVE_RUNNING };
}

/** Pending providers get their late result swapped in at request time without a rebuild. */
export function settlePending(section: CodexBarSection): CodexBarSection {
  if (!section.providers.some((p) => p.error === LIVE_RUNNING)) return section;
  const providers = section.providers.map((p) => {
    if (p.error !== LIVE_RUNNING) return p;
    const s = slots.get(p.id);
    return s?.outcome && !s.inflight ? s.outcome : p;
  });
  return { ...section, providers };
}

export async function readCodexBar(): Promise<CodexBarSection> {
  const cli = codexbarCli();
  if (!cli) {
    return { available: false, cli: null, providers: [], note: 'CodexBar CLI not found (expected /Applications/CodexBar.app/Contents/Helpers/CodexBarCLI).' };
  }
  const providers = await Promise.all(
    SPECS.map(async (spec) => {
      const s = slot(spec.id);
      // A provider that just failed is not retried on every 60 s build, only every ERROR_BACKOFF_MS.
      if (!s.inflight && s.outcome && s.outcome.status !== 'ok' && Date.now() - s.outcomeAt < ERROR_BACKOFF_MS) return s.outcome;
      const p = s.inflight ?? start(cli, spec);
      const waitMs = Math.max(0, DEADLINE_MS - (Date.now() - s.startedAt));
      let timer: NodeJS.Timeout | undefined;
      const late = new Promise<null>((r) => (timer = setTimeout(() => r(null), waitMs)));
      const v = await Promise.race([p, late]);
      clearTimeout(timer);
      return v ?? pending(spec);
    }),
  );
  return { available: true, cli, providers, note: 'Read through CodexBar\'s own CLI (claude via the claude.ai web session, codex via the Codex CLI); "history" means CodexBar\'s last recorded sample.' };
}
