import 'server-only';

type Entry<T> = { at: number; value?: T; inflight?: Promise<T>; retryAt?: number };
const store = ((globalThis as unknown as { __voltaCache?: Map<string, Entry<unknown>> }).__voltaCache ??= new Map());

/** Least-recently-used keys beyond this are evicted (every key holds a full payload, e.g. a graph). */
const MAX_KEYS = 32;
/** After a failed background refresh the stale value is served without retrying for this long. */
const RETRY_AFTER_FAIL_MS = 60_000;

function put<T>(key: string, e: Entry<T>) {
  store.delete(key); // re-insert → most recently used
  store.set(key, e as Entry<unknown>);
  while (store.size > MAX_KEYS) store.delete(store.keys().next().value as string);
}

/** Start one load for `key`. On failure the last good value is kept (logged, no new background refresh for RETRY_AFTER_FAIL_MS); with none, the entry is dropped. */
function refresh<T>(key: string, prev: Entry<T> | undefined, load: () => Promise<T>): Promise<T> {
  const inflight = load().then(
    (value) => {
      put(key, { at: Date.now(), value });
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
  put(key, { at: prev?.at ?? 0, value: prev?.value, inflight });
  return inflight;
}

/**
 * Memoise an async loader for `ttlMs`, stale-while-revalidate: after the TTL the cached value is returned
 * at once and a single background refresh starts. Callers only wait when there is no value, or it is older
 * than `maxStaleMs` (default 5 × ttl). Concurrent callers share one in-flight load.
 * `force` waits for a fresh load (joining one already in flight); callers should rate-limit it.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  opts: { maxStaleMs?: number; force?: boolean } = {},
): Promise<T> {
  const e = store.get(key) as Entry<T> | undefined;
  if (opts.force) return e?.inflight ?? refresh(key, e, load);
  if (e?.value !== undefined) {
    const age = Date.now() - e.at;
    if (age < ttlMs) {
      put(key, e);
      return e.value;
    }
    if (age < (opts.maxStaleMs ?? ttlMs * 5)) {
      if (!e.inflight && Date.now() >= (e.retryAt ?? 0)) refresh(key, e, load).catch(() => {}); // failure already logged in refresh()
      return e.value;
    }
  }
  if (e?.inflight) return e.inflight;
  return refresh(key, e, load);
}
