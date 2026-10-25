'use client';
// Browser-side helpers for the Generations app (fetch wrappers + formatters). No secrets live here.
import type { GenItemRecord, MediaKind } from '@/types/media';

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

export const fileUrl = (id: string) => `/api/media/file?id=${encodeURIComponent(id)}`;

export function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GiB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function fmtUsd(n: number): string {
  if (n === 0) return '$0';
  return n < 0.1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

export const KIND_LABEL: Record<MediaKind, string> = { image: 'Image', video: 'Video', voice: 'Voice' };

export function itemDurationSec(it: GenItemRecord): number {
  const d = it.params?.duration;
  return typeof d === 'number' ? d : 3;
}
