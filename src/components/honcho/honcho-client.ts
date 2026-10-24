'use client';
// Client helpers for the Honcho GUI: proxy fetches, peer colours, time formatting.

export const START_COMMAND = 'cd ~/ErisMorn/projects/honcho && docker compose up -d';

export class HonchoClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public offline = false,
    /** Configured Honcho URL, present on offline (503) responses. */
    public url: string | null = null,
  ) {
    super(message);
    this.name = 'HonchoClientError';
  }
}

export const isAbort = (err: unknown) => (err as Error)?.name === 'AbortError';
export const isOffline = (err: unknown) => err instanceof HonchoClientError && err.offline;

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; offline?: boolean; url?: string };
  if (!res.ok) throw new HonchoClientError(body.error ?? `HTTP ${res.status}`, res.status, !!body.offline, body.url ?? null);
  return body as T;
}

export async function hGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  return parse<T>(await fetch(url, { signal, cache: 'no-store' }));
}

export async function hPost<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return parse<T>(
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
      cache: 'no-store',
    }),
  );
}

/** `/api/honcho/workspaces/<w>/<...segments>?query` with every segment encoded. */
export function wsUrl(w: string, segments: string[] = [], query?: Record<string, string | number | undefined | null>): string {
  const path = ['/api/honcho/workspaces', encodeURIComponent(w), ...segments.map(encodeURIComponent)].join('/');
  const sp = new URLSearchParams();
  if (query) for (const [k, v] of Object.entries(query)) if (v != null && v !== '') sp.set(k, String(v));
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

const PALETTE = ['#FF6B2B', '#22C55E', '#A855F7', '#06B6D4', '#F5A623', '#EC4899', '#3B82F6', '#84CC16', '#14B8A6', '#F87171', '#6366F1', '#EAB308'];

/** Stable colour per peer id. */
export function peerColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number) => String(n).padStart(2, '0');

/** "Oct 22 2026 · 18:42" in local time. Deterministic for a given input + TZ. */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MON[d.getMonth()]} ${d.getDate()} ${d.getFullYear()} · ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MON[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** Local calendar day key for grouping ("2026-10-22"). */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export function fmtSeconds(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

/** Shortens long machine ids for chips: "agent-main-cron-703c…-unknown". */
export function shortId(id: string, max = 34): string {
  if (id.length <= max) return id;
  const keep = Math.floor((max - 1) / 2);
  return `${id.slice(0, keep)}…${id.slice(-keep)}`;
}

/** Split text into alternating plain / matched segments (case-insensitive, any query word). */
export function splitHighlight(text: string, query: string): { text: string; hit: boolean }[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return [{ text, hit: false }];
  const re = new RegExp(`(${words.join('|')})`, 'gi');
  return text
    .split(re)
    .filter(Boolean)
    .map((t) => ({ text: t, hit: words.some((w) => new RegExp(`^${w}$`, 'i').test(t)) }));
}
