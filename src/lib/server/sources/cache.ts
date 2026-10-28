import 'server-only';
import fs from 'node:fs';

/** `sig`: source-file signature of `value`; `loadingSig`: the signature the in-flight load was started for. */
type Entry<T> = { at: number; value?: T; inflight?: Promise<T>; retryAt?: number; sig?: string; loadingSig?: string };
const store = ((globalThis as unknown as { __voltaCache?: Map<string, Entry<unknown>> }).__voltaCache ??= new Map());

/** Least-recently-used keys beyond this are evicted (every key holds a full payload, e.g. a graph; Notion pages are small text blobs, hence the headroom). */
const MAX_KEYS = 128;
/** After a failed background refresh the stale value is served without retrying for this long. */
const RETRY_AFTER_FAIL_MS = 60_000;

function put<T>(key: string, e: Entry<T>) {
  store.delete(key); // re-insert → most recently used
  store.set(key, e as Entry<unknown>);
  while (store.size > MAX_KEYS) store.delete(store.keys().next().value as string);
}

/** Start one load for `key`. On failure the last good value is kept (logged, no new background refresh for RETRY_AFTER_FAIL_MS); with none, the entry is dropped. */
function refresh<T>(key: string, prev: Entry<T> | undefined, load: () => Promise<T>, sig?: string): Promise<T> {
  const inflight = load().then(
    (value) => {
      put(key, { at: Date.now(), value, sig });
      return value;
    },
    (err: unknown) => {
      const cur = store.get(key) as Entry<T> | undefined;
      if (cur?.value !== undefined) {
        put(key, { at: cur.at, value: cur.value, retryAt: Date.now() + RETRY_AFTER_FAIL_MS });
        console.error(`[volta cache] refresh of "${key}" failed; keeping the last good value`, err);
      } else {
        store.delete(key);
      }
      throw err;
    },
  );
  put(key, { at: prev?.at ?? 0, value: prev?.value, inflight, sig: prev?.sig, loadingSig: sig });
  return inflight;
}

/** Change signature of `files` (mtime + size; '-' for a missing file), so an edit, delete or create is seen. */
export function filesSig(files: readonly string[]): string {
  return files
    .map((f) => {
      try {
        const st = fs.statSync(f);
        return `${st.mtimeMs}:${st.size}`;
      } catch {
        return '-';
      }
    })
    .join('|');
}

export interface CachedOptions {
  /** Serve a stale value (refreshing in the background) up to this age; default 5 × ttl. */
  maxStaleMs?: number;
  /** Wait for a fresh load (joining one already in flight). */
  force?: boolean;
  /** Ignore `force` when the value is younger than this (rate-limits refresh buttons and ?refresh=1). */
  minForceMs?: number;
  /** Files the value is derived from: when any of them changes, the cached value is dropped and reloaded. */
  mtimeOf?: readonly string[];
  /** Caller-computed source signature (e.g. a vault snapshot's): same effect as `mtimeOf`, one entry per key. */
  sig?: string;
}

/**
 * Memoise an async loader for `ttlMs`, stale-while-revalidate: after the TTL the cached value is returned
 * at once and a single background refresh starts. Callers only wait when there is no value, or it is older
 * than `maxStaleMs` (default 5 × ttl), or a file in `mtimeOf` changed. Concurrent callers share one in-flight load.
 * `force` waits for a fresh load (joining one already in flight), at most once per `minForceMs`.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, opts: CachedOptions = {}): Promise<T> {
  let e = store.get(key) as Entry<T> | undefined;
  const sig = opts.sig ?? (opts.mtimeOf ? filesSig(opts.mtimeOf) : undefined);
  if (e && sig !== undefined && e.sig !== sig) {
    if (e.inflight && e.loadingSig === sig) return e.inflight; // a reload for the new files is already running
    e = undefined; // source files changed: the old value is wrong, not just old
  }
  if (opts.force && !(opts.minForceMs && e?.value !== undefined && Date.now() - e.at < opts.minForceMs)) {
    return e?.inflight ?? refresh(key, e, load, sig);
  }
  if (e?.value !== undefined) {
    const age = Date.now() - e.at;
    if (age < ttlMs) {
      put(key, e);
      return e.value;
    }
    if (age < (opts.maxStaleMs ?? ttlMs * 5)) {
      if (!e.inflight && Date.now() >= (e.retryAt ?? 0)) refresh(key, e, load, sig).catch(() => {}); // failure already logged in refresh()
      return e.value;
    }
  }
  if (e?.inflight) return e.inflight;
  return refresh(key, e, load, sig);
}

const memos = ((globalThis as unknown as { __voltaFileMemo?: Map<string, { sig: string; value: unknown }> }).__voltaFileMemo ??= new Map());

/**
 * Synchronous memo for config-style loaders: re-runs `load` only when one of `files` changed (mtime/size, or
 * appeared / vanished). For async loaders use `cached(..., { mtimeOf })`.
 */
export function memoByFiles<T>(key: string, files: readonly string[], load: () => T): T {
  const sig = filesSig(files);
  const hit = memos.get(key);
  if (hit && hit.sig === sig) return hit.value as T;
  const value = load();
  memos.set(key, { sig, value });
  return value;
}

type BreakerState = { fails: number; openUntil: number; reason: string };
const breakers = ((globalThis as unknown as { __voltaBreakers?: Map<string, BreakerState> }).__voltaBreakers ??= new Map());

/**
 * Circuit breaker: after `failures` consecutive failures for a key, `state()` reports open for `coolMs` so callers
 * fail fast instead of waiting out timeouts (or paying for calls that keep failing). `key` scopes it (e.g. per workspace).
 */
export function breaker(name: string, { failures = 1, coolMs }: { failures?: number; coolMs: number }) {
  const get = (key: string) => {
    const id = `${name}:${key}`;
    let b = breakers.get(id);
    if (!b) breakers.set(id, (b = { fails: 0, openUntil: 0, reason: '' }));
    return b;
  };
  return {
    state(key = '') {
      const b = get(key);
      const retryInMs = Math.max(0, b.openUntil - Date.now());
      return { open: retryInMs > 0, retryInMs, reason: b.reason };
    },
    fail(key = '', reason = 'failed') {
      const b = get(key);
      b.fails += 1;
      b.reason = reason;
      if (b.fails >= failures) b.openUntil = Date.now() + coolMs;
    },
    ok(key = '') {
      const b = get(key);
      b.fails = 0;
      b.openUntil = 0;
      b.reason = '';
    },
  };
}
