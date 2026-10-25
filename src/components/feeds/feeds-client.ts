'use client';
// Browser helpers for VOLTA Feeds: fetch wrappers + formatters. The server masks every string; nothing secret lives here.
import type { FeedItem, FeedListResponse, FeedStatus, FeedTriage } from '@/lib/server/feeds/types';

export type { FeedItem, FeedListItem, FeedListResponse, FeedSource, FeedStatus, FeedTriage } from '@/lib/server/feeds/types';

export async function api<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export interface FeedQuery {
  source: string | null;
  q: string;
  needsAction: boolean;
  unread: boolean;
}

export function listUrl(f: FeedQuery, opts: { cursor?: string | null; limit?: number; refresh?: boolean } = {}): string {
  const p = new URLSearchParams();
  if (f.source) p.set('source', f.source);
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.needsAction) p.set('needsAction', '1');
  if (f.unread) p.set('unread', '1');
  if (opts.cursor) p.set('cursor', opts.cursor);
  if (opts.limit) p.set('limit', String(opts.limit));
  if (opts.refresh) p.set('refresh', '1');
  return `/api/feeds?${p.toString()}`;
}

export const fetchList = (f: FeedQuery, opts?: { cursor?: string | null; limit?: number; refresh?: boolean }, signal?: AbortSignal) => api<FeedListResponse>(listUrl(f, opts), undefined, signal);
export const fetchItem = (id: string, signal?: AbortSignal) => api<FeedItem>(`/api/feeds/item?id=${encodeURIComponent(id)}`, undefined, signal);
export const postRead = (b: { ids?: string[]; source?: string; all?: boolean; read?: boolean }) => api<{ changed: number; persisted: boolean; reason?: string }>('/api/feeds/read', b);

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return 'now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86_400) return `${Math.round(s / 3600)}h`;
  if (s < 14 * 86_400) return `${Math.round(s / 86_400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function fullDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

export function fmtDuration(ms: number | null): string | null {
  if (ms === null) return null;
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export const TRIAGE_LABEL: Record<FeedTriage, string> = { 'needs-action': 'Needs action', fyi: 'FYI', noise: 'Noise' };
export const STATUS_LABEL: Record<FeedStatus, string> = { ok: 'OK', error: 'Failed', skipped: 'Skipped', info: 'Info' };
