'use client';
// Keyed, visibility-aware shared JSON store (generalised from the /api/sources store in left-sources.ts).
//
// Every component that reads the same URL shares one cached payload, one in-flight request and one
// refcounted poll timer, so e.g. /api/skills-real or /api/routines is fetched once per poll no matter how
// many panels show it. Each subscriber states its own poll interval (null = load once); the entry polls at
// the shortest one. Ticks are skipped while the tab is hidden; when it becomes visible again an entry
// refetches only if its interval has elapsed since its last request. A poll tick never pre-empts a request
// already in flight. An entry first subscribed while the tab is hidden waits for it to become visible
// (no request at all while hidden). The last good payload is kept when a later request fails.
//
// Hydration-safe: the server snapshot and the first client render always report `loading`.

import { useCallback, useSyncExternalStore } from 'react';
import { getJson, type ApiError } from '@/components/ltm/ltm-client';

export interface SharedJsonState<T> {
  data: T | null; // last good payload (kept when a later request fails)
  error: ApiError | Error | null; // last request error, cleared on success
  loading: boolean; // true until the first response (success or failure)
  refreshing: boolean; // a request is in flight
  fetchedAt: number; // epoch ms the last request settled (0 = never)
}

export interface SharedJson<T> extends SharedJsonState<T> {
  /** Fetch now (joins a request that started <5 s ago instead of aborting it). */
  reload: () => Promise<void>;
}

/** A manual reload joins an in-flight request younger than this rather than restarting it. */
const JOIN_INFLIGHT_MS = 5_000;

const SERVER_STATE: SharedJsonState<never> = Object.freeze({ data: null, error: null, loading: true, refreshing: false, fetchedAt: 0 });

interface Entry {
  url: string;
  state: SharedJsonState<unknown>;
  subs: Map<() => void, number | null>; // listener → its poll interval
  timer: ReturnType<typeof setTimeout> | null;
  teardown: ReturnType<typeof setTimeout> | null;
  inflight: { ctrl: AbortController; promise: Promise<void>; startedAt: number } | null;
  lastStart: number; // epoch ms the last request started (0 = never)
}

const entries = new Map<string, Entry>();
let activeEntries = 0;

function entryFor(url: string): Entry {
  let e = entries.get(url);
  if (!e) {
    e = { url, state: SERVER_STATE, subs: new Map(), timer: null, teardown: null, inflight: null, lastStart: 0 };
    entries.set(url, e);
  }
  return e;
}

function emit(e: Entry, next: Partial<SharedJsonState<unknown>>) {
  e.state = { ...e.state, ...next };
  for (const l of e.subs.keys()) l();
}

/** Shortest poll interval among the subscribers (null when every subscriber loads once). */
function intervalOf(e: Entry): number | null {
  let min: number | null = null;
  for (const ms of e.subs.values()) if (ms && ms > 0 && (min === null || ms < min)) min = ms;
  return min;
}

function clearTimer(e: Entry) {
  if (e.timer) clearTimeout(e.timer);
  e.timer = null;
}

function schedule(e: Entry, delay: number) {
  clearTimer(e);
  if (e.subs.size === 0 || intervalOf(e) === null) return;
  e.timer = setTimeout(() => tick(e), Math.max(0, delay));
}

/** Hidden tab: let the timer lapse; the visibilitychange handler resumes polling. */
function tick(e: Entry) {
  e.timer = null;
  if (document.visibilityState !== 'visible') return;
  if (e.inflight) {
    // A request older than the interval is still running (slow/hung): never pre-empt it, look again later.
    schedule(e, intervalOf(e) ?? 0);
    return;
  }
  void start(e);
}

function start(e: Entry): Promise<void> {
  e.inflight?.ctrl.abort();
  const ctrl = new AbortController();
  const startedAt = Date.now();
  e.lastStart = startedAt;
  if (!e.state.refreshing) emit(e, { refreshing: true });
  const promise = getJson<unknown>(e.url, ctrl.signal)
    .then(
      (data) => {
        if (!ctrl.signal.aborted) emit(e, { data, error: null, loading: false, refreshing: false, fetchedAt: Date.now() });
      },
      (err: unknown) => {
        if (ctrl.signal.aborted) return;
        emit(e, { error: err instanceof Error ? err : new Error(String(err)), loading: false, refreshing: false, fetchedAt: Date.now() });
      },
    )
    .finally(() => {
      if (e.inflight?.ctrl === ctrl) e.inflight = null;
    });
  e.inflight = { ctrl, promise, startedAt };
  schedule(e, intervalOf(e) ?? 0);
  return promise;
}

function onVisibility() {
  if (document.visibilityState !== 'visible') return;
  for (const e of entries.values()) {
    if (e.subs.size === 0) continue;
    // Subscribed while hidden (background load, a URL key that changed overnight, HMR): first load now.
    if (e.lastStart === 0) {
      if (!e.inflight) void start(e);
      continue;
    }
    const ms = intervalOf(e);
    if (ms === null) continue;
    const since = Date.now() - e.lastStart;
    if (since >= ms && !e.inflight) void start(e);
    else if (!e.timer) schedule(e, ms - since);
  }
}

/** Re-arm the timer for the current interval, counted from the last request. */
function reschedule(e: Entry) {
  const ms = intervalOf(e);
  if (ms === null) return clearTimer(e);
  const since = Date.now() - e.lastStart;
  if (since >= ms && !e.inflight && document.visibilityState === 'visible') void start(e);
  else schedule(e, ms - since);
}

function activate(e: Entry) {
  if (e.teardown) {
    // Re-subscribed before the deferred teardown ran (StrictMode remount, interval change, same-URL widget
    // swap): keep the in-flight request, just follow the (possibly new) interval.
    clearTimeout(e.teardown);
    e.teardown = null;
    reschedule(e);
    return;
  }
  if (activeEntries++ === 0) document.addEventListener('visibilitychange', onVisibility);
  // Hidden tab: no request yet; onVisibility starts every entry that has never loaded (lastStart 0).
  if (document.visibilityState !== 'visible') return;
  void start(e);
}

function deactivate(e: Entry) {
  // Deferred so an immediate re-subscribe keeps the in-flight request and timer.
  e.teardown = setTimeout(() => {
    e.teardown = null;
    if (e.subs.size > 0) return;
    clearTimer(e);
    e.inflight?.ctrl.abort();
    e.inflight = null;
    if (e.state.refreshing) e.state = { ...e.state, refreshing: false };
    if (--activeEntries === 0) document.removeEventListener('visibilitychange', onVisibility);
  }, 0);
}

function subscribe(url: string, pollMs: number | null, listener: () => void): () => void {
  const e = entryFor(url);
  const before = intervalOf(e);
  const wasEmpty = e.subs.size === 0;
  e.subs.set(listener, pollMs);
  if (wasEmpty) activate(e);
  else if (intervalOf(e) !== before) reschedule(e); // a faster subscriber joined: bring the next poll forward
  return () => {
    const prev = intervalOf(e);
    e.subs.delete(listener);
    if (e.subs.size === 0) deactivate(e);
    else if (intervalOf(e) !== prev) reschedule(e); // the fastest subscriber left: slow down
  };
}

/** Fetch `url` now for every subscriber (joins a request that started <5 s ago). Resolves once it settles. */
export function refreshSharedJson(url: string): Promise<void> {
  const e = entryFor(url);
  if (e.inflight && Date.now() - e.inflight.startedAt < JOIN_INFLIGHT_MS) return e.inflight.promise;
  return start(e);
}

/** Current state of `url` (outside React, e.g. right after `await refreshSharedJson(url)`). */
export function getSharedJsonState<T>(url: string): SharedJsonState<T> {
  return (entries.get(url)?.state ?? SERVER_STATE) as SharedJsonState<T>;
}

/** Shared, polled JSON for `url`. `pollMs` null = load on first subscribe only (still receives other subscribers' polls). */
export function useSharedJson<T>(url: string, pollMs: number | null): SharedJson<T> {
  const sub = useCallback((listener: () => void) => subscribe(url, pollMs, listener), [url, pollMs]);
  const snap = useCallback(() => entryFor(url).state as SharedJsonState<T>, [url]);
  const state = useSyncExternalStore(sub, snap, () => SERVER_STATE as SharedJsonState<T>);
  const reload = useCallback(() => refreshSharedJson(url), [url]);
  return { ...state, reload };
}
