import 'server-only';
import os from 'node:os';
import { redactSecrets } from '../redact';

// Small, bounded HTTP + JSON helpers for the Systems probes (processes go through ../proc). Every call has a short
// timeout; nothing here ever starts, stops or writes anything.

export const HOME = os.homedir();

export interface HttpResult {
  /** HTTP 2xx. */
  ok: boolean;
  /** Something answered (any status). */
  reachable: boolean;
  status: number | null;
  latencyMs: number | null;
  json: unknown;
  /** "connection refused", "timed out after 2s", "HTTP 401" … (redacted). */
  error: string | null;
}

const MAX_BODY = 2 * 1024 * 1024;

/** GET a loopback URL with a hard timeout. Latency = until the body is read. Never sends credentials. */
export async function httpGet(url: string, timeoutMs = 2_000): Promise<HttpResult> {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
    const text = await res.text();
    const latencyMs = Math.round(performance.now() - t0);
    let json: unknown = null;
    if (text.length <= MAX_BODY) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { ok: res.ok, reachable: true, status: res.status, latencyMs, json, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    const code = e.cause?.code;
    const error =
      e.name === 'TimeoutError' || e.name === 'AbortError'
        ? `timed out after ${(timeoutMs / 1000).toFixed(timeoutMs % 1000 ? 1 : 0)}s`
        : code === 'ECONNREFUSED'
          ? 'connection refused'
          : code === 'ECONNRESET'
            ? 'connection reset'
            : redactSecrets(code ?? e.message ?? 'request failed').slice(0, 240);
    return { ok: false, reachable: false, status: null, latencyMs: null, json: null, error };
  }
}

/** Narrow unknown JSON to a plain object. */
export const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
