import 'server-only';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { redactSecrets } from '../redact';

// Small, bounded process + HTTP helpers for the Systems probes. Every call has a short timeout; nothing here
// ever starts, stops or writes anything.

export const HOME = os.homedir();

/** "~/…" for display (never leaks the username in paths shown to the page). */
export const tilde = (p: string) => (p.startsWith(HOME) ? `~${p.slice(HOME.length)}` : p);

/** First existing absolute path, else the bare name (resolved through PATH). */
function bin(name: string, candidates: string[]): string {
  return candidates.find((c) => fs.existsSync(c)) ?? name;
}

export const BIN = {
  lsof: bin('lsof', ['/usr/sbin/lsof']),
  ps: bin('ps', ['/bin/ps']),
  launchctl: bin('launchctl', ['/bin/launchctl']),
  plutil: bin('plutil', ['/usr/bin/plutil']),
  df: bin('df', ['/bin/df']),
  du: bin('du', ['/usr/bin/du']),
  nice: bin('nice', ['/usr/bin/nice']),
  sysctl: bin('sysctl', ['/usr/sbin/sysctl']),
  vmStat: bin('vm_stat', ['/usr/bin/vm_stat']),
  memoryPressure: bin('memory_pressure', ['/usr/bin/memory_pressure']),
  docker: bin('docker', ['/usr/local/bin/docker', '/opt/homebrew/bin/docker', '/Applications/Docker.app/Contents/Resources/bin/docker']),
};

export interface RunResult {
  stdout: string;
  stderr: string;
  /** Exit code (0 on success); null when the process couldn't start or was killed by the timeout. */
  code: number | null;
  error: string | null;
}

/** execFile that never throws: non-zero exits still return their stdout (df/du print partial results). */
export function run(file: string, args: string[], timeoutMs: number, maxBuffer = 4 * 1024 * 1024): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } }, (err, stdout, stderr) => {
      if (!err) return resolve({ stdout, stderr, code: 0, error: null });
      const e = err as NodeJS.ErrnoException & { code?: number | string; killed?: boolean };
      const code = typeof e.code === 'number' ? e.code : null;
      const reason =
        e.code === 'ENOENT'
          ? `${file.split('/').pop()} not found`
          : e.killed
            ? `timed out after ${Math.round(timeoutMs / 1000)}s`
            : (stderr || e.message || 'failed').trim().split('\n')[0];
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code, error: redactSecrets(reason).slice(0, 240) });
    });
  });
}

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

export const GiB = 1024 ** 3;
