// Client helpers for VOLTA Briefing: typed fetch + formatters. No server imports.
import type { EpisodeRecord } from '@/lib/server/podcast/types';

export async function api<T>(url: string, body?: unknown, method?: 'POST' | 'PUT'): Promise<T> {
  const res = await fetch(url, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j: unknown = null;
  try {
    j = await res.json();
  } catch {
    // non-JSON error body
  }
  if (!res.ok) {
    const o = (j ?? {}) as { error?: string; needsConfirm?: boolean };
    throw Object.assign(new Error(o.error || `${url} failed (${res.status})`), { status: res.status, needsConfirm: !!o.needsConfirm });
  }
  return j as T;
}

export const fileUrl = (date: string, variant?: string) => `/api/podcast/file?date=${encodeURIComponent(date)}${variant ? `&src=${variant}` : ''}`;
/** Unique list key: a muse.ai and a legacy Gemini episode can share a date. */
export const epKey = (e: { date: string; variant?: string }) => (e.variant ? `${e.date}:${e.variant}` : e.date);

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GiB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

export const fmtUsd = (n: number) => (n >= 0.1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Sat · Oct 24" from YYYY-MM-DD, with no timezone drift. */
export function fmtDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DAYS[dt.getUTCDay()]} · ${MONTHS[m - 1]} ${d}`;
}

export const fmtSecs = (ms: number | null) => (ms === null ? '…' : ms < 1000 ? `${ms} ms` : ms < 90_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`);

export interface ResearchHealth {
  succeeded: number;
  attempted: number;
  minOk: number;
  degraded: boolean;
  skipped?: string;
  /** One entry per distinct failure reason, with the topics that hit it. */
  failures: { error: string; topics: string[] }[];
  /** Made before research errors were recorded: counts come from the stage note and the real reason was not kept. */
  legacy: boolean;
}

/** Research health of an episode. Older episodes have no `research` field, so the counts are read from the research stage note. */
export function researchHealth(ep: Pick<EpisodeRecord, 'research' | 'timings'>): ResearchHealth | null {
  const r = ep.research;
  if (r) {
    const groups = new Map<string, string[]>();
    for (const e of r.errors) {
      const k = e.error.replace(/^claude -p \(research [^)]*\):\s*/, '');
      groups.set(k, [...(groups.get(k) ?? []), e.topic]);
    }
    const failures = [...groups.entries()].map(([error, topics]) => ({ error, topics })).sort((a, b) => b.topics.length - a.topics.length);
    return { succeeded: r.succeeded, attempted: r.attempted, minOk: r.minOk, degraded: r.degraded, skipped: r.skipped, failures, legacy: false };
  }
  const m = ep.timings.find((t) => t.stage === 'research')?.note?.match(/(\d+)\/(\d+) topics/);
  if (!m) return null;
  const succeeded = Number(m[1]);
  const attempted = Number(m[2]);
  const minOk = Math.ceil(attempted / 2);
  return { succeeded, attempted, minOk, degraded: attempted > 0 && succeeded < minOk, failures: [], legacy: true };
}
