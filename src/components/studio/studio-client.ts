'use client';
// Browser-side helpers for VOLTA Studio: fetch wrapper, formatters and the SSE log hook. No secrets live here.
import { useEffect, useRef, useState } from 'react';
import type { LogEvent, StudioJob } from '@/types/studio';

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

export function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GiB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function fmtDur(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '';
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function ago(iso: string | null): string {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 45) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const KIND_COLOR: Record<string, string> = {
  remotion: 'text-teal border-teal/40 bg-teal/10',
  hyperframes: 'text-purple border-purple/40 bg-purple/10',
  ffmpeg: 'text-green border-green/40 bg-green/10',
  pipeline: 'text-amber border-amber/40 bg-amber/10',
};

export const ACTIVE = new Set(['queued', 'running']);

export interface JobLog {
  lines: LogEvent[];
  job: StudioJob | null;
  progress: { pct: number | null; label: string } | null;
  ended: boolean;
}

/** Streams GET /api/studio/jobs/:id/log (SSE). Lines are batched so a chatty render does not re-render per line. */
export function useJobLog(jobId: string | null): JobLog {
  const [state, setState] = useState<JobLog>({ lines: [], job: null, progress: null, ended: false });
  const buf = useRef<LogEvent[]>([]);
  useEffect(() => {
    setState({ lines: [], job: null, progress: null, ended: false });
    buf.current = [];
    if (!jobId) return;
    let closed = false;
    let lastSeq = 0;
    let timer: number | null = null;
    const flush = () => {
      timer = null;
      if (closed || !buf.current.length) return;
      const batch = buf.current;
      buf.current = [];
      setState((s) => ({ ...s, lines: [...s.lines, ...batch].slice(-4000) }));
    };
    const es = new EventSource(`/api/studio/jobs/${encodeURIComponent(jobId)}/log`);
    const on = <T,>(name: string, fn: (d: T) => void) => es.addEventListener(name, (e) => fn(JSON.parse((e as MessageEvent).data) as T));
    on<StudioJob>('init', (job) => setState((s) => ({ ...s, job, progress: job.progress })));
    on<LogEvent>('log', (l) => {
      if (l.seq <= lastSeq) return;
      lastSeq = l.seq;
      buf.current.push(l);
      if (timer === null) timer = window.setTimeout(flush, 120);
    });
    on<{ pct: number | null; label: string }>('progress', (p) => setState((s) => ({ ...s, progress: p })));
    on<StudioJob>('status', (job) => setState((s) => ({ ...s, job, progress: job.progress })));
    on<object>('end', () => {
      flush();
      setState((s) => ({ ...s, ended: true }));
      es.close();
    });
    // EventSource reconnects by itself (Last-Event-ID replays missed lines); nothing to do on error.
    return () => {
      closed = true;
      if (timer !== null) window.clearTimeout(timer);
      es.close();
    };
  }, [jobId]);
  return state;
}
