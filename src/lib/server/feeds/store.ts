import 'server-only';
import fs from 'node:fs/promises';
import { WINDSOR_ROOT, isWindsorMounted, onWindsor, serialised, writeAtomic } from '@/lib/server/storage';
import { FEEDS_DIR, READ_PATH, TRIAGE_PATH } from './config';
import type { FeedTriage } from './types';

// Persistent state on the Windsor drive: read marks (read.json) and cached JEV triage labels (triage.json).
// Atomic writes, serialised per file. If the drive is not mounted nothing is written to the boot disk: the state is
// kept in memory for this server process and the API reports persisted:false.

/** Bump when the triage labels/instructions change: older cached labels are ignored and items are classified again. */
export const TRIAGE_VERSION = 2;
const KEEP_MS = 180 * 24 * 3600 * 1000;

async function driveProblem(): Promise<string | null> {
  if (!onWindsor(FEEDS_DIR)) return null;
  return (await isWindsorMounted()) ? null : `${WINDSOR_ROOT} is not mounted`;
}

/** A JSON file plus the in-memory copy that stands in for it (and the persisted/reason the UI shows) while Windsor is away. */
class JsonState<T extends { version: 1 }> {
  private data: T;
  private mtimeMs = -1;
  persisted = true;
  reason: string | undefined;
  constructor(
    readonly file: string,
    private readonly empty: () => T,
  ) {
    this.data = empty();
  }

  /** Current contents; re-read from disk when another process changed the file. */
  async get(): Promise<T> {
    const problem = await driveProblem();
    if (problem) {
      this.persisted = false;
      this.reason = problem;
      return this.data;
    }
    try {
      const st = await fs.stat(this.file);
      if (st.mtimeMs !== this.mtimeMs) {
        const parsed = JSON.parse(await fs.readFile(this.file, 'utf8')) as T;
        if (parsed && parsed.version === 1) {
          this.data = { ...this.empty(), ...parsed };
          this.mtimeMs = st.mtimeMs;
        }
      }
      this.persisted = true;
      this.reason = undefined;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.persisted = false;
        this.reason = `Cannot read ${this.file}: ${(err as Error).message}`;
      }
    }
    return this.data;
  }

  /** Apply `mutate` to the data and persist it. Resolves with whether it reached the disk. */
  update(mutate: (d: T) => void): Promise<{ persisted: boolean; reason?: string }> {
    return serialised(this.file, async () => {
      const d = await this.get();
      mutate(d);
      const problem = await driveProblem();
      if (problem) {
        this.persisted = false;
        this.reason = problem;
        return { persisted: false, reason: `${problem}; marks are kept for this session only.` };
      }
      try {
        await writeAtomic(this.file, `${JSON.stringify(d)}\n`);
        this.mtimeMs = (await fs.stat(this.file)).mtimeMs;
        this.persisted = true;
        this.reason = undefined;
        return { persisted: true };
      } catch (err) {
        this.persisted = false;
        this.reason = (err as Error).message;
        return { persisted: false, reason: `Could not write ${this.file}: ${(err as Error).message}` };
      }
    });
  }
}

interface ReadFile {
  version: 1;
  /** item id -> ISO time it was marked read */
  read: Record<string, string>;
}
interface TriageFile {
  version: 1;
  labels: Record<string, { l: FeedTriage; c: number; at: string; v?: number }>;
}

const g = globalThis as unknown as { __feedsRead?: JsonState<ReadFile>; __feedsTriage?: JsonState<TriageFile> };
export const readState = (): JsonState<ReadFile> => (g.__feedsRead ??= new JsonState<ReadFile>(READ_PATH, () => ({ version: 1, read: {} })));
export const triageState = (): JsonState<TriageFile> => (g.__feedsTriage ??= new JsonState<TriageFile>(TRIAGE_PATH, () => ({ version: 1, labels: {} })));

export function pruneOld(map: Record<string, string>) {
  const cutoff = Date.now() - KEEP_MS;
  for (const [k, v] of Object.entries(map)) if (Date.parse(v) < cutoff) delete map[k];
}
export function pruneTriage(map: TriageFile['labels']) {
  const cutoff = Date.now() - KEEP_MS;
  for (const [k, v] of Object.entries(map)) if (Date.parse(v.at) < cutoff) delete map[k];
}

/** The cached label for an item, if it was produced by the current instructions. */
export const labelOf = (labels: TriageFile['labels'], id: string) => {
  const l = labels[id];
  return l && l.v === TRIAGE_VERSION ? l : undefined;
};
