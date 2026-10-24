import 'server-only';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { RoutineHealth } from '@/types/sources';
import { PIECES_VAULT_DIR, ltmSourceRange } from '../vaults';
import { cached } from './cache';
import { getLaunchAgent } from './routines';

// Health of the LTM → Pieces-Vault summary pipeline (unvolta ltm_ingest.py, LaunchAgent com.unvolta.ltm-ingest).
// Read-only: lists/stats/reads the heads of the newest ltm/ notes, ltm_state.json and the tail of the agent's log.

export const LTM_INGEST_LABEL = 'com.unvolta.ltm-ingest';
const LTM_DIR = path.join(PIECES_VAULT_DIR, 'ltm');
const STATE_FILE = path.join(PIECES_VAULT_DIR, 'memory', 'ltm_state.json');
const HEAD_BYTES = 4096; // frontmatter lives at the top
const MAX_NOTES_READ = 60; // newest-by-name session notes whose frontmatter is parsed
const LOG_TAIL_BYTES = 4096;

export interface LtmSummaryWatermark {
  /** Highest capture id covered by a session note (`source: "ltm:A-B"` → B) among the newest notes. */
  summarizedThroughId: number | null;
  summarizedNote: string | null; // vault-relative path of that note
  /** ltm_state.json `last_id`: ingest's own watermark (also advances past short bursts it skips without a note). */
  ingestWatermarkId: number | null;
  newestNoteMtime: string | null; // newest mtime among notes in the newest two ltm/<yyyy-mm>/ folders
  notesRead: number;
}

export interface LtmIngestAgent {
  loaded: boolean;
  running: boolean;
  exitCode: number | null;
  health: RoutineHealth;
  schedule: string;
  logPath: string | null;
  logUpdatedAt: string | null;
  /** Error class on the log's last line (e.g. "TimeoutError"); only the class name, never the line itself. */
  lastLogError: string | null;
}

async function readHead(abs: string, bytes: number): Promise<string> {
  const fh = await fsp.open(abs, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.toString('utf8', 0, bytesRead);
  } finally {
    await fh.close();
  }
}

async function readTail(abs: string, bytes: number): Promise<string> {
  const fh = await fsp.open(abs, 'r');
  try {
    const { size } = await fh.stat();
    const len = Math.min(bytes, size);
    const buf = Buffer.alloc(len);
    const { bytesRead } = await fh.read(buf, 0, len, size - len);
    return buf.toString('utf8', 0, bytesRead);
  } finally {
    await fh.close();
  }
}

async function loadWatermark(): Promise<LtmSummaryWatermark> {
  let months: string[] = [];
  try {
    months = (await fsp.readdir(LTM_DIR)).filter((d) => /^\d{4}-\d{2}$/.test(d)).sort().reverse().slice(0, 2);
  } catch {
    // no ltm/ folder
  }
  const files: { rel: string; abs: string; name: string }[] = [];
  for (const m of months) {
    try {
      for (const f of await fsp.readdir(path.join(LTM_DIR, m))) {
        if (f.endsWith('.md') && !f.startsWith('.')) files.push({ rel: `ltm/${m}/${f}`, abs: path.join(LTM_DIR, m, f), name: f });
      }
    } catch {
      // unreadable month
    }
  }
  let newest = 0;
  await Promise.all(
    files.map(async (f) => {
      try {
        newest = Math.max(newest, (await fsp.stat(f.abs)).mtimeMs);
      } catch {
        // vanished
      }
    }),
  );
  // Note names start with the session date, so newest-by-name ≈ the latest sessions.
  const newestByName = [...files].sort((a, b) => b.name.localeCompare(a.name)).slice(0, MAX_NOTES_READ);
  let best: { to: number; rel: string } | null = null;
  for (const f of newestByName) {
    try {
      const range = ltmSourceRange(await readHead(f.abs, HEAD_BYTES));
      if (range && (!best || range.to > best.to)) best = { to: range.to, rel: f.rel };
    } catch {
      // unreadable note
    }
  }
  let ingestWatermarkId: number | null = null;
  try {
    const st = JSON.parse(await fsp.readFile(STATE_FILE, 'utf8')) as { last_id?: unknown };
    if (typeof st.last_id === 'number' && Number.isInteger(st.last_id)) ingestWatermarkId = st.last_id;
  } catch {
    // no state file
  }
  return {
    summarizedThroughId: best?.to ?? null,
    summarizedNote: best?.rel ?? null,
    ingestWatermarkId,
    newestNoteMtime: newest ? new Date(newest).toISOString() : null,
    notesRead: newestByName.length,
  };
}

/** Summary watermark from the newest notes + ltm_state.json (cached 2 min; reads ≤ 60 note heads). */
export function getLtmSummaryWatermark(): Promise<LtmSummaryWatermark> {
  return cached('pieces:ltm-watermark', 2 * 60_000, loadWatermark);
}

/** The ltm-ingest LaunchAgent: loaded / last exit / log freshness; null when its plist isn't installed. */
export async function getLtmIngestAgent(): Promise<LtmIngestAgent | null> {
  const a = await getLaunchAgent(LTM_INGEST_LABEL);
  if (!a) return null;
  const r = a.routine;
  const logPath = a.logPaths[0] ?? null;
  let lastLogError: string | null = null;
  if (logPath) {
    try {
      const lastLine = (await readTail(logPath, LOG_TAIL_BYTES)).split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? '';
      lastLogError = lastLine.match(/\b([A-Z][A-Za-z]*(?:Error|Exception))\b/)?.[1] ?? (/^Traceback\b/.test(lastLine) ? 'Traceback' : null);
    } catch {
      // no log yet
    }
  }
  return {
    loaded: r.enabled,
    running: !!r.running,
    exitCode: r.exitCode,
    health: r.health,
    schedule: r.schedule,
    logPath,
    logUpdatedAt: r.logUpdatedAt ?? null,
    lastLogError,
  };
}
