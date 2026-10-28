import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { WINDSOR_ROOT, WINDSOR_VOLTA, isWindsorMounted, onWindsor, serialised, writeAtomic } from '@/lib/server/storage';
import type { JevOp, JevTelemetryFile, ModelTierName } from './types';

/**
 * Cost/latency counter persisted to the Windsor volume (not the near-full boot SSD).
 * In-memory mirror is the source of truth for reads; writes are debounced + atomic (tmp → rename).
 * If the volume is not mounted the counters keep working in memory and `persisted` reports false.
 */
export const TELEMETRY_PATH = process.env.VOLTA_JEV_TELEMETRY_PATH || path.join(WINDSOR_VOLTA, 'jev', 'telemetry.json');
/** Input tokens are the only billed unit: $42 per billion = $0.042 per million. */
export const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

const MAX_SAMPLES = 200;
const FLUSH_MS = 400;

interface Holder {
  t: JevTelemetryFile;
  timer: NodeJS.Timeout | null;
  persisted: boolean;
  persistError: string | null;
}
const g = globalThis as typeof globalThis & { __voltaJevTelemetry?: Holder };

function blank(): JevTelemetryFile {
  const now = new Date().toISOString();
  return {
    version: 1,
    since: now,
    updatedAt: now,
    requests: 0,
    cacheHits: 0,
    errors: 0,
    fallbacks: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalUsd: 0,
    latencyMs: { avg: 0, p50: 0, p95: 0, max: 0, samples: [] },
    byOp: { route: 0, rank: 0, triage: 0, judge: 0 },
    byTier: { HAIKU: 0, SONNET: 0, OPUS: 0 },
    lastError: null,
  };
}

function load(): Holder {
  let t = blank();
  let persisted = false;
  let persistError: string | null = null;
  try {
    const raw = JSON.parse(fs.readFileSync(TELEMETRY_PATH, 'utf8')) as Partial<JevTelemetryFile>;
    if (raw && raw.version === 1) {
      const b = blank();
      t = {
        ...b,
        ...raw,
        latencyMs: { ...b.latencyMs, ...(raw.latencyMs ?? {}), samples: Array.isArray(raw.latencyMs?.samples) ? raw.latencyMs!.samples.slice(-MAX_SAMPLES) : [] },
        byOp: { ...b.byOp, ...(raw.byOp ?? {}) },
        byTier: { ...b.byTier, ...(raw.byTier ?? {}) },
      };
      persisted = true;
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') persistError = (e as Error).message;
  }
  return { t, timer: null, persisted, persistError };
}

const holder = (): Holder => (g.__voltaJevTelemetry ??= load());

function recomputeLatency(t: JevTelemetryFile) {
  const s = [...t.latencyMs.samples].sort((a, b) => a - b);
  if (!s.length) return;
  const pick = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  t.latencyMs.avg = Math.round(s.reduce((a, b) => a + b, 0) / s.length);
  t.latencyMs.p50 = pick(0.5);
  t.latencyMs.p95 = pick(0.95);
  t.latencyMs.max = Math.max(t.latencyMs.max, s[s.length - 1]);
}

function scheduleFlush(h: Holder) {
  if (h.timer) return;
  h.timer = setTimeout(() => {
    h.timer = null;
    void flushNow(h);
  }, FLUSH_MS);
  h.timer.unref?.();
}

function flushNow(h: Holder): Promise<void> {
  return serialised(TELEMETRY_PATH, async () => {
    try {
      // Never fabricate the /Volumes mount point when the drive is absent.
      if (onWindsor(TELEMETRY_PATH) && !(await isWindsorMounted())) throw new Error(`${WINDSOR_ROOT} is not mounted`);
      h.t.updatedAt = new Date().toISOString();
      await writeAtomic(TELEMETRY_PATH, JSON.stringify(h.t, null, 2));
      h.persisted = true;
      h.persistError = null;
    } catch (e) {
      h.persisted = false;
      h.persistError = (e as Error).message;
    }
  });
}

/** A completed network request that returned answers. */
export function recordRequest(op: JevOp, latencyMs: number, inputTokens: number, outputTokens: number): number {
  const h = holder();
  const costUsd = inputTokens * USD_PER_INPUT_TOKEN;
  h.t.requests += 1;
  h.t.byOp[op] += 1;
  h.t.inputTokens += inputTokens;
  h.t.outputTokens += outputTokens;
  h.t.totalUsd += costUsd;
  h.t.latencyMs.samples.push(Math.round(latencyMs));
  if (h.t.latencyMs.samples.length > MAX_SAMPLES) h.t.latencyMs.samples.splice(0, h.t.latencyMs.samples.length - MAX_SAMPLES);
  recomputeLatency(h.t);
  scheduleFlush(h);
  return costUsd;
}

export function recordCacheHit(): void {
  const h = holder();
  h.t.cacheHits += 1;
  scheduleFlush(h);
}

export function recordError(code: string, message: string): void {
  const h = holder();
  h.t.errors += 1;
  h.t.lastError = { at: new Date().toISOString(), code, message: message.slice(0, 200) };
  scheduleFlush(h);
}

export function recordTier(tier: ModelTierName, fallback: boolean): void {
  const h = holder();
  h.t.byTier[tier] += 1;
  if (fallback) h.t.fallbacks += 1;
  scheduleFlush(h);
}

export function readTelemetry(): JevTelemetryFile & { persisted: boolean; persistError: string | null; path: string } {
  const h = holder();
  return { ...h.t, latencyMs: { ...h.t.latencyMs, samples: [] }, persisted: h.persisted, persistError: h.persistError, path: TELEMETRY_PATH };
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));

/** Compact summary in the shape the UI's JevRouteResult.telemetry expects (calls = tier decisions made). */
export function telemetrySummary() {
  const t = holder().t;
  const decisions = t.byTier.HAIKU + t.byTier.SONNET + t.byTier.OPUS;
  return {
    calls: decisions,
    totalUsd: Math.round(t.totalUsd * 1e8) / 1e8,
    haikuPct: pct(t.byTier.HAIKU, decisions),
    sonnetPct: pct(t.byTier.SONNET, decisions),
    opusPct: pct(t.byTier.OPUS, decisions),
  };
}
