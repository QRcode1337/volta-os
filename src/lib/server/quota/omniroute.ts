import 'server-only';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadRoutes } from '../llm/config';
import type { OmniProvider, OmniSection, OmniState, QuotaWindow, TokenCounts } from './types';

// OmniRoute usage + health, read-only, from the gateway's own SQLite store and CLI:
//   ~/.omniroute/storage.sqlite   usage_history (per-request tokens), quota_snapshots (OmniRoute's own provider
//                                 quota poller: remaining %, exhausted, reset), provider_connections (auth state),
//                                 api_keys.allowed_connections of the volta-os key (names + ids only, never the key)
//   omniroute resilience breakers|cooldowns   live circuit-breaker state (held in the server's memory)
// The management HTTP API refuses the volta-os key (it has no "manage" scope, deliberately), and the DB is the same
// data the dashboard shows. The sqlite3 CLI is opened with -readonly, so this can never write to OmniRoute's store.
// No credential column is ever selected.

const DB_PATH = process.env.VOLTA_OMNIROUTE_DB || path.join(os.homedir(), '.omniroute', 'storage.sqlite');
const SQLITE = '/usr/bin/sqlite3';
const VOLTA_KEY_NAME = 'volta-os';
const SNAPSHOT_LOOKBACK_MS = 2 * 86_400_000;

const LABELS: Record<string, string> = {
  claude: 'Claude (Max)',
  codex: 'Codex (ChatGPT)',
  antigravity: 'Antigravity (Gemini)',
  agy: 'Antigravity (agy)',
  'grok-cli': 'Grok Build',
  'xai-oauth': 'xAI OAuth (Grok)',
  github: 'GitHub Copilot',
  cursor: 'Cursor',
  cline: 'Cline',
  gemini: 'Gemini (AI Studio key)',
  xai: 'xAI (API key)',
  'nous-research': 'Nous Research',
  'opencode-zen': 'OpenCode Zen',
  'ollama-local': 'Ollama (local)',
  'ollama-cloud': 'Ollama Cloud',
  'lm-studio': 'LM Studio',
  'llama-cpp': 'llama.cpp (local)',
};
const LOCAL = new Set(['ollama-local', 'lm-studio', 'llama-cpp']);
const label = (id: string) => LABELS[id] ?? id;

function sqlite<T>(sql: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    execFile(SQLITE, ['-readonly', '-cmd', '.timeout 3000', '-json', DB_PATH, sql], { timeout: 10_000, maxBuffer: 8 << 20 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`sqlite3: ${(stderr.trim().split('\n')[0] || err.message.split('\n')[0] || 'failed').slice(0, 160)}`));
      const t = stdout.trim();
      if (!t) return resolve([]); // sqlite3 -json prints nothing for zero rows
      try {
        resolve(JSON.parse(t) as T[]);
      } catch {
        reject(new Error('sqlite3 returned unparseable output'));
      }
    });
  });
}

/** ISO strings are interpolated into SQL, so build them here from Dates only. */
const isoOf = (ms: number) => new Date(ms).toISOString();

function omnirouteBin(): string | null {
  const home = os.homedir();
  const cands = [process.env.OMNIROUTE_BIN ?? '', path.join(home, '.local', 'bin', 'omniroute'), '/opt/homebrew/bin/omniroute', '/usr/local/bin/omniroute'];
  try {
    const base = path.join(home, '.local', 'share', 'mise', 'installs', 'node');
    for (const v of fs.readdirSync(base).sort().reverse()) cands.push(path.join(base, v, 'bin', 'omniroute'));
  } catch {
    // no mise
  }
  return cands.find((c) => c && fs.existsSync(c)) ?? null;
}

/** `omniroute --output json …` as parsed JSON, or null. The CLI authenticates itself locally, so OMNIROUTE_API_KEY must NOT be in its env (the volta-os key would be refused). */
function cliJson(bin: string, args: string[]): Promise<unknown> {
  return new Promise((resolve) => {
    const binDir = path.dirname(fs.realpathSync(bin));
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', HOME: os.homedir(), USER: process.env.USER ?? '', LANG: 'en_US.UTF-8', PATH: `${path.dirname(bin)}:${binDir}:/usr/bin:/bin:/usr/sbin:/sbin`, TMPDIR: process.env.TMPDIR ?? '/tmp', NO_COLOR: '1' };
    execFile(bin, ['--output', 'json', ...args], { timeout: 8_000, maxBuffer: 2 << 20, env }, (err, stdout) => {
      if (err) return resolve(null);
      const m = /^[[{]/m.exec(stdout);
      if (!m) return resolve(null);
      try {
        resolve(JSON.parse(stdout.slice(m.index)));
      } catch {
        resolve(null);
      }
    });
  });
}

const blank = (): TokenCounts => ({ requests: 0, tokensIn: 0, tokensOut: 0, failures: 0 });
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

async function gatewayState(): Promise<{ state: 'up' | 'down' | 'unknown'; url: string }> {
  const cfg = loadRoutes();
  const base = (process.env[cfg.gateway.baseUrlEnv]?.trim() || cfg.gateway.baseUrl).replace(/\/+$/, '').replace(/\/v1$/, '');
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2500), cache: 'no-store' });
    return { state: res.ok ? 'up' : 'down', url: base };
  } catch {
    return { state: 'down', url: base };
  }
}

interface UsageRow {
  provider: string;
  reqToday: number;
  inToday: number;
  outToday: number;
  failToday: number;
  reqWeek: number;
  inWeek: number;
  outWeek: number;
  failWeek: number;
  lastAt: string | null;
}
interface VoltaRow {
  provider: string;
  reqToday: number;
  inToday: number;
  outToday: number;
  failToday: number;
  reqWeek: number;
  inWeek: number;
  outWeek: number;
  failWeek: number;
}
interface ConnRow {
  id: string;
  provider: string;
  auth_type: string | null;
  is_active: number;
  test_status: string | null;
  rate_limited_until: string | null;
  last_error_type: string | null;
}
interface SnapRow {
  provider: string;
  conn: string;
  wk: string;
  rem: number | null;
  ex: number | null;
  rst: string | null;
  at: string;
}

const AGG = (todayIso: string) => `
  COUNT(*) AS reqWeek,
  COALESCE(SUM(tokens_input),0) AS inWeek, COALESCE(SUM(tokens_output),0) AS outWeek, COALESCE(SUM(success = 0),0) AS failWeek,
  COALESCE(SUM(timestamp >= '${todayIso}'),0) AS reqToday,
  COALESCE(SUM(CASE WHEN timestamp >= '${todayIso}' THEN tokens_input END),0) AS inToday,
  COALESCE(SUM(CASE WHEN timestamp >= '${todayIso}' THEN tokens_output END),0) AS outToday,
  COALESCE(SUM(CASE WHEN timestamp >= '${todayIso}' THEN (success = 0) END),0) AS failToday`;

const counts = (r: UsageRow | VoltaRow | undefined, span: 'Today' | 'Week'): TokenCounts =>
  r ? { requests: n(r[`req${span}`]), tokensIn: n(r[`in${span}`]), tokensOut: n(r[`out${span}`]), failures: n(r[`fail${span}`]) } : blank();

function stateOf(conns: ConnRow[], windows: QuotaWindow[], breakerOpen: boolean): { state: OmniState; detail: string | null } {
  const active = conns.filter((c) => c.is_active === 1);
  if (active.length === 0) {
    if (conns.some((c) => /expired|unauth|invalid/i.test(c.test_status ?? ''))) return { state: 'expired', detail: 'OAuth login expired: reconnect it in OmniRoute' };
    return { state: 'inactive', detail: 'no active connection' };
  }
  if (breakerOpen) return { state: 'cooldown', detail: 'circuit breaker open' };
  const now = Date.now();
  const cooling = active.filter((c) => c.rate_limited_until && Date.parse(c.rate_limited_until) > now);
  if (cooling.length === active.length) return { state: 'cooldown', detail: `rate limited until ${cooling[0].rate_limited_until}` };
  const known = windows.filter((w) => w.exhausted !== undefined);
  if (known.length > 0 && known.every((w) => w.exhausted)) return { state: 'exhausted', detail: `${known.map((w) => w.label).join(', ')} at 0%` };
  const out = known.filter((w) => w.exhausted);
  if (out.length > 0) return { state: 'limited', detail: `${out.map((w) => w.label).join(', ')} exhausted` };
  const bad = active.find((c) => /error|fail/i.test(c.test_status ?? ''));
  if (bad) return { state: 'limited', detail: `last test: ${bad.test_status}` };
  return { state: 'ok', detail: null };
}

export async function readOmniRoute(): Promise<OmniSection> {
  const now = Date.now();
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const todayIso = isoOf(d.getTime());
  const weekIso = isoOf(now - 7 * 86_400_000);
  const base: OmniSection = {
    available: false,
    gateway: 'unknown',
    gatewayUrl: '',
    todayFrom: todayIso,
    weekFrom: weekIso,
    providers: [],
    breakers: [],
    cooldowns: [],
    volta: null,
  };
  if (!fs.existsSync(DB_PATH) || !fs.existsSync(SQLITE)) {
    return { ...base, error: !fs.existsSync(DB_PATH) ? `OmniRoute database not found at ${DB_PATH}` : 'sqlite3 not found at /usr/bin/sqlite3' };
  }
  const bin = omnirouteBin();
  try {
    const [gw, usage, volta, conns, snaps, keyRow, breakersRaw, cooldownsRaw] = await Promise.all([
      gatewayState(),
      sqlite<UsageRow>(`SELECT provider, ${AGG(todayIso)}, MAX(timestamp) AS lastAt FROM usage_history WHERE timestamp >= '${weekIso}' GROUP BY provider`),
      sqlite<VoltaRow>(`SELECT provider, ${AGG(todayIso)} FROM usage_history WHERE timestamp >= '${weekIso}' AND api_key_name = '${VOLTA_KEY_NAME}' GROUP BY provider`),
      sqlite<ConnRow>('SELECT id, provider, auth_type, is_active, test_status, rate_limited_until, last_error_type FROM provider_connections'),
      sqlite<SnapRow>(
        `SELECT q.provider AS provider, q.connection_id AS conn, q.window_key AS wk, q.remaining_percentage AS rem, q.is_exhausted AS ex, q.next_reset_at AS rst, q.created_at AS at
         FROM quota_snapshots q JOIN (SELECT MAX(id) AS mid FROM quota_snapshots WHERE created_at >= '${isoOf(now - SNAPSHOT_LOOKBACK_MS)}' GROUP BY provider, connection_id, window_key) m ON q.id = m.mid`,
      ),
      sqlite<{ allowed_connections: string | null }>(`SELECT allowed_connections FROM api_keys WHERE name = '${VOLTA_KEY_NAME}' AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`),
      bin ? cliJson(bin, ['resilience', 'breakers']) : Promise.resolve(null),
      bin ? cliJson(bin, ['resilience', 'cooldowns']) : Promise.resolve(null),
    ]);

    let allowed: Set<string> | null = null;
    try {
      const arr = JSON.parse(keyRow[0]?.allowed_connections ?? 'null') as unknown;
      if (Array.isArray(arr) && arr.length > 0) allowed = new Set(arr.filter((x): x is string => typeof x === 'string'));
    } catch {
      allowed = null;
    }

    const breakers = (Array.isArray(breakersRaw) ? breakersRaw : []).slice(0, 40).map((b: Record<string, unknown>) => ({
      name: String(b.name ?? b.provider ?? b.id ?? 'unknown').slice(0, 60),
      state: String(b.state ?? b.status ?? 'open').slice(0, 24),
      detail: typeof b.failures === 'number' ? `${b.failures} failures` : undefined,
    }));
    const cooldowns = (Array.isArray(cooldownsRaw) ? cooldownsRaw : []).slice(0, 40).map((c: Record<string, unknown>) => ({
      name: String(c.provider ?? c.name ?? c.connectionId ?? 'unknown').slice(0, 60),
      detail: typeof c.until === 'string' ? `until ${c.until}` : undefined,
    }));
    const breakerOpen = new Set(breakers.filter((b) => !/closed/i.test(b.state)).map((b) => b.name.toLowerCase()));

    const byProvider = new Map<string, ConnRow[]>();
    for (const c of conns) (byProvider.get(c.provider) ?? byProvider.set(c.provider, []).get(c.provider)!).push(c);
    const usageBy = new Map(usage.map((r) => [r.provider, r]));
    const voltaBy = new Map(volta.map((r) => [r.provider, r]));
    const winBy = new Map<string, QuotaWindow[]>();
    for (const s of snaps) {
      // 0% with is_exhausted = 0 is how OmniRoute stores "no percentage" (credit-style windows), not an empty quota.
      const rem = s.rem === null || (s.rem <= 0 && s.ex !== 1) ? null : Math.max(0, s.rem);
      const w: QuotaWindow = {
        id: `${s.conn.slice(0, 8)}:${s.wk}`,
        label: s.wk,
        usedPercent: rem !== null && rem <= 100 ? Math.round((100 - rem) * 10) / 10 : null,
        remainingPercent: rem !== null && rem <= 100 ? Math.round(rem * 10) / 10 : null,
        windowMinutes: null,
        resetsAt: s.rst,
        exhausted: s.ex === 1,
      };
      (winBy.get(s.provider) ?? winBy.set(s.provider, []).get(s.provider)!).push(w);
    }

    // Providers that have a connection or recent traffic. Rows named after a combo (failed combo calls are logged
    // under the combo's name) are not providers and are skipped.
    const ids = new Set<string>([...byProvider.keys(), ...[...usageBy.keys()].filter((k) => byProvider.has(k))]);
    const providers: OmniProvider[] = [];
    for (const id of ids) {
      const cs = byProvider.get(id) ?? [];
      const wins = winBy.get(id) ?? [];
      const { state, detail } = stateOf(cs, wins, breakerOpen.has(id.toLowerCase()));
      const u = usageBy.get(id);
      const kind: OmniProvider['kind'] = LOCAL.has(id) ? 'local' : cs.length > 0 && cs.every((c) => c.auth_type === 'oauth') ? 'subscription' : cs.some((c) => c.auth_type === 'oauth') && !cs.some((c) => c.auth_type === 'apikey') ? 'subscription' : 'api';
      providers.push({
        id,
        label: label(id),
        kind,
        connections: { total: cs.length, active: cs.filter((c) => c.is_active === 1).length },
        state,
        stateDetail: detail,
        today: counts(u, 'Today'),
        week: counts(u, 'Week'),
        voltaWeek: counts(voltaBy.get(id), 'Week'),
        lastUsedAt: u?.lastAt ?? null,
        voltaAllowed: allowed ? cs.some((c) => allowed!.has(c.id)) : null,
        windows: wins,
      });
    }
    // Used providers first (most tokens this week), then idle ones by name.
    providers.sort((a, b) => b.week.tokensIn + b.week.tokensOut - (a.week.tokensIn + a.week.tokensOut) || a.label.localeCompare(b.label));

    const sum = (key: 'today' | 'week'): TokenCounts => volta.reduce((acc, r) => {
      const c = counts(r, key === 'today' ? 'Today' : 'Week');
      return { requests: acc.requests + c.requests, tokensIn: acc.tokensIn + c.tokensIn, tokensOut: acc.tokensOut + c.tokensOut, failures: acc.failures + c.failures };
    }, blank());

    return {
      ...base,
      available: true,
      gateway: gw.state,
      gatewayUrl: gw.url,
      providers,
      breakers,
      cooldowns,
      volta: { today: sum('today'), week: sum('week') },
      note: bin ? undefined : 'omniroute CLI not found: circuit-breaker state unavailable (connection state from the database only).',
    };
  } catch (err) {
    return { ...base, error: (err as Error).message.slice(0, 200) };
  }
}
