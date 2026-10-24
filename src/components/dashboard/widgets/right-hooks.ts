'use client';
// Shared client helpers for the home right column (TODAY · ROUTINES · SKILLS DECK).

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { ApiError, getJson } from '@/components/ltm/ltm-client';

export interface PolledJson<T> {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean; // true until the first response (success or failure)
  refreshing: boolean;
  reload: () => void;
}

/**
 * @deprecated Home widgets use `useSharedJson` (./shared-json) so each URL has one request, one poll timer and
 * one cache across panels. Kept only for any out-of-area caller; nothing on the home page uses it.
 *
 * Fetch JSON on mount and every `intervalMs` (null = once). `url` may be a function so time-derived
 * query params (e.g. today's local date) are recomputed on each poll. Each request gets its own
 * AbortController. Ticks are skipped while the tab is hidden; when it becomes visible again a refetch
 * fires only if at least `intervalMs` has passed since the last fetch, and every fetch (tick, refocus
 * or manual reload) restarts the timer — so requests never land closer together than `intervalMs`
 * except for an explicit reload. The last good payload is kept when a later poll fails.
 */
export function usePolledJson<T>(url: string | (() => string), intervalMs: number | null): PolledJson<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const urlRef = useRef(url);
  urlRef.current = url;
  const ctrlRef = useRef<AbortController | null>(null);
  const kickRef = useRef<() => void>(() => {});

  const load = useCallback(async () => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setRefreshing(true);
    try {
      const u = typeof urlRef.current === 'function' ? urlRef.current() : urlRef.current;
      const body = await getJson<T>(u, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setData(body);
      setError(null);
    } catch (e) {
      if (ctrl.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (ctrlRef.current === ctrl) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastFetch = 0;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const schedule = (delay: number) => {
      clear();
      if (intervalMs) timer = setTimeout(tick, delay);
    };
    const fetchNow = () => {
      lastFetch = Date.now();
      void load();
      schedule(intervalMs ?? 0);
    };
    // Hidden tab: let the timer lapse; onVisible resumes polling.
    function tick() {
      timer = null;
      if (document.visibilityState === 'visible') fetchNow();
    }
    const onVisible = () => {
      if (!intervalMs || document.visibilityState !== 'visible') return;
      const since = Date.now() - lastFetch;
      if (since >= intervalMs) fetchNow();
      else if (!timer) schedule(intervalMs - since);
    };
    kickRef.current = fetchNow;
    fetchNow();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clear();
      kickRef.current = () => {};
      document.removeEventListener('visibilitychange', onVisible);
      ctrlRef.current?.abort();
    };
  }, [load, intervalMs]);

  const reload = useCallback(() => kickRef.current(), []);
  return { data, error, loading, refreshing, reload };
}

/** localStorage read, safe in private windows / blocked storage. */
export function readLocal<T>(key: string, isValid: (v: unknown) => v is T): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — preference just won't persist */
  }
}

/** "in 18m" · "in 2h 05m" · "in 1d 9h" · "due now" · "12m overdue". */
export function relativeUntil(targetMs: number, nowMs: number): string {
  const mins = Math.round((targetMs - nowMs) / 60_000);
  if (mins < -1) return `${-mins}m overdue`;
  if (mins <= 0) return 'due now';
  if (mins < 60) return `in ${mins}m`;
  if (mins < 24 * 60) return `in ${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  return `in ${d}d${h ? ` ${h}h` : ''}`;
}

/** A Date as the naive local ISO string LTM stores ("2026-10-23T22:44:16"). */
export function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Local "HH:MM" for an epoch ms (call only after mount). */
export function localHHMM(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Human message for a failed fetch. */
export function errorText(e: ApiError | Error | null): string {
  if (!e) return '';
  if (e instanceof ApiError) return e.status ? `${e.message} (HTTP ${e.status})` : e.message;
  return e.message || 'Request failed';
}

/** Live content-box size of an element (null until measured after mount). */
export function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      const width = Math.round(r?.width ?? el.clientWidth);
      const height = Math.round(r?.height ?? el.clientHeight);
      setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/**
 * Callback-ref variant of useElementSize for elements that mount conditionally (e.g. only once data
 * has loaded): pass the returned setter as `ref`; observation (re)starts whenever the node changes.
 */
export function useMeasure<T extends HTMLElement = HTMLDivElement>(): [(el: T | null) => void, { width: number; height: number } | null] {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      const width = Math.round(r?.width ?? el.clientWidth);
      const height = Math.round(r?.height ?? el.clientHeight);
      setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size];
}

/** Live content-box width of an element (null until measured after mount). */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number | null {
  return useElementSize(ref)?.width ?? null;
}
