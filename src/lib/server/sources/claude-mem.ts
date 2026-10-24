import 'server-only';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// claude-mem worker (its own viewer runs at http://localhost:37777). Read-only stats.

export const CLAUDE_MEM_URL = process.env.CLAUDE_MEM_URL ?? 'http://localhost:37777';
const OBSERVER_HEALTH = path.join(os.homedir(), '.claude-mem', 'observer-health.json');
/** The worker answers in a few ms; a slower answer means it is stalled, and Memory Sources must not wait on it. */
const TIMEOUT_MS = 2000;

export interface ClaudeMemObserver {
  consecutiveFailures: number;
  failingSince: string | null; // ISO
  lastErrorCode: string | null; // e.g. "rate_limited"
  lastErrorAt: string | null;
  lastSuccessAt: string | null;
}

export interface ClaudeMemStats {
  /** The worker answered this time. */
  online: boolean;
  /** Counts below are from the last answer (online = false → from an earlier answer at `answeredAt`). */
  observations: number;
  sessions: number;
  summaries: number;
  firstObservationAt: string | null;
  latest: { title: string; type: string; createdAt: string; project: string } | null;
  /** When the worker last answered (ISO); null = never answered since the server started. */
  answeredAt: string | null;
  /** ~/.claude-mem/observer-health.json (the background observer that writes observations); null when absent. */
  observer: ClaudeMemObserver | null;
}

type Good = Omit<ClaudeMemStats, 'online' | 'observer'>;
const g = globalThis as unknown as { __claudeMemGood?: Good };

const iso = (ms: unknown) => (typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : null);

async function readObserver(): Promise<ClaudeMemObserver | null> {
  try {
    const h = JSON.parse(await fsp.readFile(OBSERVER_HEALTH, 'utf8')) as Record<string, unknown>;
    return {
      consecutiveFailures: typeof h.consecutiveFailures === 'number' ? h.consecutiveFailures : 0,
      failingSince: iso(h.failingSinceAt),
      lastErrorCode: typeof h.lastErrorCode === 'string' ? h.lastErrorCode.slice(0, 40) : null,
      lastErrorAt: iso(h.lastErrorAt),
      lastSuccessAt: iso(h.lastSuccessAt),
    };
  } catch {
    return null;
  }
}

function getJson(url: string): Promise<unknown> {
  return fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

export async function getClaudeMemStats(): Promise<ClaudeMemStats> {
  const last = g.__claudeMemGood;
  const statsOnce = () => getJson(`${CLAUDE_MEM_URL}/api/stats`);
  const [stats, obs, observer] = await Promise.all([
    // One retry only when there is nothing to fall back on (first probe after a server start).
    (last ? statsOnce() : statsOnce().catch(statsOnce)).catch(() => null),
    getJson(`${CLAUDE_MEM_URL}/api/observations?limit=1`).catch(() => null),
    readObserver(),
  ]);
  if (!stats) {
    return last
      ? { ...last, online: false, observer }
      : { online: false, observations: 0, sessions: 0, summaries: 0, firstObservationAt: null, latest: null, answeredAt: null, observer };
  }
  const db =
    (stats as { database?: { observations?: number; sessions?: number; summaries?: number; firstObservationAt?: string } }).database ?? {};
  const item = (obs as { items?: { title?: string; type?: string; created_at?: string; project?: string }[] } | null)?.items?.[0];
  const good: Good = {
    observations: db.observations ?? 0,
    sessions: db.sessions ?? 0,
    summaries: db.summaries ?? 0,
    firstObservationAt: typeof db.firstObservationAt === 'string' ? db.firstObservationAt : null,
    latest: item
      ? { title: item.title ?? '', type: item.type ?? '', createdAt: item.created_at ?? '', project: item.project ?? '' }
      : (last?.latest ?? null),
    answeredAt: new Date().toISOString(),
  };
  g.__claudeMemGood = good;
  return { ...good, online: true, observer };
}
