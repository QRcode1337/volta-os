'use client';
// Client helpers for the LTM viewer: fetching, app colours, time/label formatting, highlight splitting.

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public unavailable = false,
  ) {
    super(message);
  }
}

export const isAbortError = (err: unknown) => (err as { name?: string } | null)?.name === 'AbortError';

/**
 * GET JSON. Rejects with ApiError on a non-2xx status or on a 2xx body that isn't JSON (never
 * resolves with a made-up `{}`), and re-throws an abort even when it lands while the body is still
 * streaming, so a superseded request always rejects with AbortError instead of resolving.
 */
export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: 'no-store' });
  let body: { error?: string; unavailable?: boolean } | null = null;
  try {
    body = (await res.json()) as { error?: string; unavailable?: boolean };
  } catch (err) {
    if (signal?.aborted || isAbortError(err)) throw err;
    if (res.ok) throw new ApiError(`Malformed JSON from ${url.split('?')[0]}`, res.status);
  }
  if (!res.ok) throw new ApiError(body?.error ?? `HTTP ${res.status}`, res.status, !!body?.unavailable);
  return body as T;
}

const KNOWN_APP_COLORS: Record<string, string> = {
  Safari: '#3B82F6',
  Claude: '#FF5500',
  Notion: '#E8E4DA',
  ghostty: '#22C55E',
  Finder: '#06B6D4',
  Obsidian: '#A855F7',
  Comet: '#14B8A6',
  VLC: '#F5A623',
  'Grok Bot': '#EF4444',
  Hermes: '#F472B6',
  Code: '#60A5FA',
  Terminal: '#4ADE80',
  News: '#F87171',
};
const PALETTE = ['#FF6B2B', '#10B981', '#8B5CF6', '#EAB308', '#EC4899', '#0EA5E9', '#84CC16', '#F97316', '#6366F1', '#2DD4BF'];

/** Stable colour per app name. */
export function appColor(app: string): string {
  if (KNOWN_APP_COLORS[app]) return KNOWN_APP_COLORS[app];
  let h = 0;
  for (let i = 0; i < app.length; i++) h = (h * 31 + app.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** "2026-10-22T18:18:42.07" → seconds since local midnight (timestamps are stored as local time). */
export function secondsOfDay(ts: string): number {
  return Number(ts.slice(11, 13)) * 3600 + Number(ts.slice(14, 16)) * 60 + Number(ts.slice(17, 19));
}

export const hhmm = (ts: string) => ts.slice(11, 16);
export const hhmmss = (ts: string) => ts.slice(11, 19);

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-22" → { dow: "Thu", label: "Oct 22", month: "October 2026" } without timezone drift. */
export function dayLabel(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return {
    dow: DOW[dt.getUTCDay()],
    label: `${MON[m - 1]} ${d}`,
    long: `${DOW[dt.getUTCDay()]}, ${MON[m - 1]} ${d} ${y}`,
    month: `${dt.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${y}`,
  };
}

/** Local "now" as the same naive ISO format the DB uses (call only after mount). */
export function nowLocalIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Minutes between two naive local ISO timestamps. */
export function minutesBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 60_000);
}

export function agoLabel(mins: number): string {
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

/** Split text into alternating [plain, match, plain, …] segments, case-insensitive. */
export function splitHighlight(text: string, query: string): { text: string; hit: boolean }[] {
  if (!query) return [{ text, hit: false }];
  const out: { text: string; hit: boolean }[] = [];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let i = 0;
  for (;;) {
    const j = lower.indexOf(q, i);
    if (j < 0) break;
    if (j > i) out.push({ text: text.slice(i, j), hit: false });
    out.push({ text: text.slice(j, j + q.length), hit: true });
    i = j + q.length;
  }
  if (i < text.length) out.push({ text: text.slice(i), hit: false });
  return out;
}
