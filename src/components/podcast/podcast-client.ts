// Client helpers for VOLTA Briefing: typed fetch + formatters. No server imports.

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

export const fileUrl = (date: string) => `/api/podcast/file?date=${encodeURIComponent(date)}`;

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
