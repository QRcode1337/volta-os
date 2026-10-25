import 'server-only';
import { cached } from '../sources/cache';
import type { ProbeResult } from './types';

const PROBE_TIMEOUT_MS = 2000;

async function doProbe(url: string): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    // redirect:'manual' -> a 3xx counts as alive and we never follow it somewhere unexpected.
    const res = await fetch(url, { method: 'GET', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    void res.body?.cancel().catch(() => {});
    return { state: res.status < 500 ? 'up' : 'down', httpStatus: res.status, ms: Date.now() - t0 };
  } catch {
    return { state: 'down', ms: Date.now() - t0 };
  }
}

/** Cheap liveness probe (any HTTP answer below 500 = up), cached per URL. Never throws. */
export function probe(url: string, ttlMs = 20_000, force = false): Promise<ProbeResult> {
  return cached(`launchpad:probe:${url}`, ttlMs, () => doProbe(url), { maxStaleMs: ttlMs * 2, force }).catch(() => ({ state: 'unknown' as const }));
}
