import 'server-only';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TokenWindow, UsageSummary } from '@/types/sources';
import { cached } from './cache';

// Parses Claude Code transcripts (~/.claude/projects/**/*.jsonl) for token usage and Skill invocations.
// Transcripts are append-only, so each file keeps a byte offset and only the appended tail is parsed;
// a file that shrank or was rewritten in place is re-read from the start.

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const LOOKBACK_DAYS = 30;
const CACHE_TTL_MINUTES = 60; // this machine's sessions use the 1h prompt-cache TTL
const SCAN_TTL_MS = 60_000; // = the /api/usage poll; stale-while-revalidate keeps polls from waiting
const NEWLINE = 0x0a;

interface UsageEvent {
  id: string;
  ts: number; // epoch ms
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}
interface SkillEvent {
  id: string | null; // tool_use id — resumed sessions copy earlier messages into a new file
  ts: number;
  skill: string;
}
interface FileScan {
  mtimeMs: number;
  size: number;
  offset: number; // bytes parsed: end of the last complete line
  sessionId: string; // a subagent transcript counts toward its parent session
  /** Written by a background tool (claude-mem's observer), not by a session the user ran. */
  automated?: boolean;
  usage: Map<string, UsageEvent>; // by message id
  skills: SkillEvent[];
}

const g = globalThis as unknown as { __transcriptCache?: unknown; __transcriptCacheV2?: Map<string, FileScan> };
delete g.__transcriptCache; // pre-offset cache shape (survives HMR otherwise)
const fileCache = (g.__transcriptCacheV2 ??= new Map());

async function listTranscripts(dir: string, depth = 0, out: string[] = []): Promise<string[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 3) await listTranscripts(p, depth + 1, out);
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

/** <project>/<session>.jsonl → session; <project>/<session>/subagents/agent-x.jsonl → session. */
function sessionIdOf(file: string): string {
  const dir = path.dirname(file);
  return path.basename(dir) === 'subagents' ? path.basename(path.dirname(dir)) : path.basename(file, '.jsonl');
}

/** Project dirs whose transcripts come from background tools rather than the user's own sessions. */
const AUTOMATED_PROJECT_RE = /-claude-mem-observer-sessions$/;
const isAutomated = (file: string) => AUTOMATED_PROJECT_RE.test(path.relative(PROJECTS_DIR, file).split(path.sep)[0] ?? '');

function parseLine(buf: Buffer, usage: Map<string, UsageEvent>, skills: SkillEvent[]) {
  const hasUsage = buf.includes('"usage"');
  const hasSkill = buf.includes('"name":"Skill"');
  if (!hasUsage && !hasSkill) return;
  let rec: {
    timestamp?: string;
    message?: { id?: string; model?: string; role?: string; usage?: Record<string, number>; content?: unknown };
  };
  try {
    rec = JSON.parse(buf.toString('utf8'));
  } catch {
    return;
  }
  const ts = rec.timestamp ? Date.parse(rec.timestamp) : NaN;
  if (!Number.isFinite(ts)) return;
  const m = rec.message;
  if (hasUsage && m?.usage && m.id && m.role === 'assistant' && m.model && m.model !== '<synthetic>') {
    const u = m.usage;
    const ev: UsageEvent = {
      id: m.id,
      ts,
      model: m.model,
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
    };
    // Streamed messages repeat with growing output; keep the largest.
    const prev = usage.get(m.id);
    if (!prev || ev.output >= prev.output) usage.set(m.id, ev);
  }
  if (hasSkill && Array.isArray(m?.content)) {
    for (const block of m.content as { type?: string; id?: string; name?: string; input?: { skill?: string } }[]) {
      if (block?.type === 'tool_use' && block.name === 'Skill' && block.input?.skill) {
        skills.push({ id: typeof block.id === 'string' ? block.id : null, ts, skill: block.input.skill });
      }
    }
  }
}

/** Parse complete lines in [start, end); returns the offset just past the last newline seen. */
async function parseRange(file: string, start: number, end: number, usage: Map<string, UsageEvent>, skills: SkillEvent[]): Promise<number> {
  if (end <= start) return start;
  let pos = start; // file offset of the first pending (not yet newline-terminated) byte
  let parts: Buffer[] = [];
  let pending = 0;
  for await (const chunk of fs.createReadStream(file, { start, end: end - 1 }) as AsyncIterable<Buffer>) {
    let i = 0;
    while (i < chunk.length) {
      const nl = chunk.indexOf(NEWLINE, i);
      if (nl === -1) {
        parts.push(chunk.subarray(i));
        pending += chunk.length - i;
        break;
      }
      const piece = chunk.subarray(i, nl);
      const line = pending ? Buffer.concat([...parts, piece]) : piece;
      pos += pending + piece.length + 1;
      parts = [];
      pending = 0;
      parseLine(line, usage, skills);
      i = nl + 1;
    }
  }
  // An unterminated last line is parsed if it is already valid JSON, but the offset stays before it, so it is
  // read again once its newline lands (usage is keyed by message id and Skill calls by tool_use id → no double count).
  if (pending) parseLine(Buffer.concat(parts), usage, skills);
  return pos;
}

async function scanFile(file: string, st: fs.Stats, prev: FileScan | undefined): Promise<FileScan> {
  // Append-only growth → parse just the tail. Same size with a new mtime, or a shrink → full re-read.
  const resume = prev && st.size > prev.size && prev.offset <= st.size;
  const usage = resume ? new Map(prev.usage) : new Map<string, UsageEvent>();
  const skills = resume ? [...prev.skills] : [];
  const offset = await parseRange(file, resume ? prev.offset : 0, st.size, usage, skills);
  return { mtimeMs: st.mtimeMs, size: st.size, offset, sessionId: sessionIdOf(file), automated: isAutomated(file), usage, skills };
}

async function scanAll(): Promise<FileScan[]> {
  const cutoff = Date.now() - LOOKBACK_DAYS * 86_400_000;
  const files = await listTranscripts(PROJECTS_DIR);
  const out: FileScan[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    let st: fs.Stats;
    try {
      st = await fsp.stat(f);
    } catch {
      continue;
    }
    if (st.mtimeMs < cutoff) continue;
    seen.add(f);
    const hit = fileCache.get(f);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
      hit.automated ??= isAutomated(f); // scans cached before the field existed
      out.push(hit);
      continue;
    }
    let scan: FileScan;
    try {
      scan = await scanFile(f, st, hit);
    } catch {
      continue; // vanished or unreadable mid-scan — picked up next time
    }
    fileCache.set(f, scan);
    out.push(scan);
  }
  for (const k of fileCache.keys()) if (!seen.has(k)) fileCache.delete(k);
  return out;
}

/** All transcript data from the last 30 days (refreshed in the background at most every 60s). */
export function getTranscriptScan(): Promise<FileScan[]> {
  return cached('transcripts', SCAN_TTL_MS, scanAll);
}

const emptyWindow = (): TokenWindow => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, messages: 0 });
function add(w: TokenWindow, e: UsageEvent) {
  w.input += e.input;
  w.output += e.output;
  w.cacheRead += e.cacheRead;
  w.cacheWrite += e.cacheWrite;
  w.total += e.input + e.output + e.cacheRead + e.cacheWrite;
  w.messages += 1;
}

function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function getUsageSummary(): Promise<UsageSummary> {
  const scans = await getTranscriptScan();
  const now = Date.now();
  const w5 = emptyWindow();
  const w7 = emptyWindow();
  const byModel = new Map<string, { total: number; messages: number }>();
  const daily = new Map<string, { total: number; messages: number }>();
  const sessions7d = new Set<string>();
  const auto7 = emptyWindow();
  const autoSessions7d = new Set<string>();
  const seenIds = new Set<string>();
  let last = 0;
  for (const s of scans) {
    for (const e of s.usage.values()) {
      if (seenIds.has(e.id)) continue; // resumed sessions duplicate messages across files
      seenIds.add(e.id);
      // Background observer traffic still uses the plan (kept in the token windows), but it isn't a session the
      // user ran and it must not keep the user's prompt-cache state "WARM".
      if (!s.automated) last = Math.max(last, e.ts);
      const age = now - e.ts;
      if (age <= 5 * 3_600_000) add(w5, e);
      if (age <= 7 * 86_400_000) {
        add(w7, e);
        if (s.automated) {
          add(auto7, e);
          autoSessions7d.add(s.sessionId);
        } else sessions7d.add(s.sessionId);
        const m = byModel.get(e.model) ?? { total: 0, messages: 0 };
        m.total += e.input + e.output + e.cacheRead + e.cacheWrite;
        m.messages += 1;
        byModel.set(e.model, m);
      }
      if (age <= 15 * 86_400_000) {
        const key = localDate(new Date(e.ts));
        const d = daily.get(key) ?? { total: 0, messages: 0 };
        d.total += e.input + e.output + e.cacheRead + e.cacheWrite;
        d.messages += 1;
        daily.set(key, d);
      }
    }
  }
  const idleMinutes = last ? Math.floor((now - last) / 60_000) : Infinity;
  // Step back by calendar day (not 24h), so a 25h DST day can't repeat a date or drop the oldest one.
  const today = new Date(now);
  const days: UsageSummary['daily14d'] = [];
  for (let i = 13; i >= 0; i--) {
    const key = localDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i));
    days.push({ date: key, ...(daily.get(key) ?? { total: 0, messages: 0 }) });
  }
  return {
    window5h: w5,
    window7d: w7,
    byModel7d: [...byModel.entries()].map(([model, v]) => ({ model, ...v })).sort((a, b) => b.total - a.total),
    daily14d: days,
    sessions7d: sessions7d.size,
    automated7d: { sessions: autoSessions7d.size, total: auto7.total, messages: auto7.messages },
    lastMessageAt: last ? new Date(last).toISOString() : null,
    cache: {
      state: idleMinutes < CACHE_TTL_MINUTES ? 'WARM' : 'COLD',
      idleMinutes: Number.isFinite(idleMinutes) ? idleMinutes : -1,
      minutesLeft: Math.max(0, CACHE_TTL_MINUTES - (Number.isFinite(idleMinutes) ? idleMinutes : CACHE_TTL_MINUTES)),
      ttlMinutes: CACHE_TTL_MINUTES,
    },
    scannedFiles: scans.length,
    generatedAt: new Date().toISOString(),
  };
}

/** Skill invocation counts over the last 30 days: name → { uses, lastUsed }. */
export async function getSkillUsage(): Promise<Map<string, { uses: number; last: number }>> {
  const scans = await getTranscriptScan();
  // Files are selected by mtime, so they can hold older events: count only invocations inside the window,
  // but keep `last` from any scanned event.
  const cutoff = Date.now() - LOOKBACK_DAYS * 86_400_000;
  const map = new Map<string, { uses: number; last: number }>();
  const seenIds = new Set<string>();
  for (const s of scans)
    for (const e of s.skills) {
      if (e.id) {
        if (seenIds.has(e.id)) continue; // the same call copied into a resumed session's file
        seenIds.add(e.id);
      }
      const v = map.get(e.skill) ?? { uses: 0, last: 0 };
      if (e.ts >= cutoff) v.uses += 1;
      v.last = Math.max(v.last, e.ts);
      map.set(e.skill, v);
    }
  return map;
}
