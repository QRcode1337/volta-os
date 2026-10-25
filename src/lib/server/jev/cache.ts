import 'server-only';
import { createHash } from 'node:crypto';

/** Small TTL + LRU cache for JEV answers. Identical (model, state, questions) never costs twice. */
const MAX_ENTRIES = 500;
const TTL_MS = 6 * 60 * 60 * 1000;

interface Entry<T> {
  at: number;
  value: T;
}

const g = globalThis as typeof globalThis & { __voltaJevCache?: Map<string, Entry<unknown>>; __voltaJevInflight?: Map<string, Promise<unknown>> };
const store = (): Map<string, Entry<unknown>> => (g.__voltaJevCache ??= new Map());
const inflight = (): Map<string, Promise<unknown>> => (g.__voltaJevInflight ??= new Map());

export function cacheKey(parts: unknown): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function cacheGet<T>(key: string): T | undefined {
  const s = store();
  const e = s.get(key);
  if (!e) return undefined;
  if (Date.now() - e.at > TTL_MS) {
    s.delete(key);
    return undefined;
  }
  s.delete(key); // refresh LRU position
  s.set(key, e);
  return e.value as T;
}

export function cacheSet<T>(key: string, value: T): void {
  const s = store();
  s.delete(key);
  s.set(key, { at: Date.now(), value });
  while (s.size > MAX_ENTRIES) {
    const oldest = s.keys().next().value;
    if (oldest === undefined) break;
    s.delete(oldest);
  }
}

/** Collapse concurrent identical requests onto one promise. */
export function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const f = inflight();
  const existing = f.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = run().finally(() => f.delete(key));
  f.set(key, p);
  return p;
}

export function cacheSize(): number {
  return store().size;
}
