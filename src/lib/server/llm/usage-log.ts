import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import type { LlmErrorKind } from './types';

// Per-attempt usage + latency log, one JSON object per line, on the Windsor volume (never the near-full boot
// SSD). No prompts, no completions, no keys: only task, target, who answered, token counts, timings and a short
// redacted error. Logging never throws and never blocks a request; if the volume is not mounted the entries stay
// in a small in-memory ring (so /api/llm/routes still shows recent calls) and `persisted` reports false.

export const WINDSOR_VOLTA = '/Volumes/Windsor/VOLTA';
export const USAGE_LOG_PATH = process.env.VOLTA_LLM_USAGE_PATH || path.join(WINDSOR_VOLTA, 'llm', 'usage.jsonl');
const RING = 200;
const TAIL_BYTES = 256 * 1024;

export interface UsageEntry {
  ts: string;
  task: string;
  target: string;
  via: 'omniroute' | 'local';
  ok: boolean;
  stream: boolean;
  attempt: number;
  ms: number;
  ttfbMs?: number;
  status?: number;
  model?: string | null;
  provider?: string | null;
  connection?: string | null;
  requestId?: string | null;
  tokensIn?: number;
  tokensOut?: number;
  error?: { kind: LlmErrorKind; message: string };
  skipped?: boolean;
  apiBilledSuspect?: boolean;
}

const g = globalThis as typeof globalThis & { __voltaLlmUsage?: { ring: UsageEntry[]; persisted: boolean; lastError: string | null; dirReady: boolean } };
const state = (g.__voltaLlmUsage ??= { ring: [], persisted: false, lastError: null, dirReady: false });

export function logUsage(entry: UsageEntry): void {
  state.ring.push(entry);
  if (state.ring.length > RING) state.ring.splice(0, state.ring.length - RING);
  void (async () => {
    try {
      const dir = path.dirname(USAGE_LOG_PATH);
      if (!state.dirReady) {
        // Only create our own leaf dir; never create the volume's mount point if the drive is absent.
        if (!fs.existsSync(path.dirname(dir)) && dir.startsWith(WINDSOR_VOLTA)) throw new Error('Windsor volume not mounted');
        await fs.promises.mkdir(dir, { recursive: true });
        state.dirReady = true;
      }
      await fs.promises.appendFile(USAGE_LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
      state.persisted = true;
      state.lastError = null;
    } catch (err) {
      state.persisted = false;
      state.dirReady = false;
      state.lastError = (err as Error).message.slice(0, 160);
    }
  })();
}

/** Newest-last entries: the file tail merged with the in-memory ring (deduplicated by ts+target+attempt). */
export function recentUsage(limit = 200): { entries: UsageEntry[]; persisted: boolean; path: string; lastError: string | null } {
  const out = new Map<string, UsageEntry>();
  try {
    const fd = fs.openSync(USAGE_LOG_PATH, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const len = Math.min(size, TAIL_BYTES);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      const lines = buf.toString('utf8').split('\n');
      if (size > len) lines.shift(); // first line is probably cut
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line) as UsageEntry;
          out.set(`${e.ts}|${e.task}|${e.target}|${e.attempt}`, e);
        } catch {
          // skip a torn line
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // no file yet / volume absent: the ring below still answers
  }
  for (const e of state.ring) out.set(`${e.ts}|${e.task}|${e.target}|${e.attempt}`, e);
  const entries = [...out.values()].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0)).slice(-limit);
  return { entries, persisted: state.persisted || fs.existsSync(USAGE_LOG_PATH), path: USAGE_LOG_PATH, lastError: state.lastError };
}
