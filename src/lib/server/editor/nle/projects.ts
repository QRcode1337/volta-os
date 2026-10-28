import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { NleProjectSummary, NleSequence } from '@/types/nle';
import { sequenceDuration } from '@/lib/nle/model';
import { HttpError } from '../../http-error';
import { assertFreeSpace, writeAtomic } from '../../storage';
import { PROJECTS_DIR, TRASH_DIR, ensureDir, isEvictedError } from './paths';
import { icloudHint } from '@/lib/media-ids';

// Saved Edit-mode sequences: one JSON file per sequence in projects/. Deletes move to projects/.trash/.

export const SEQ_ID = /^seq_[a-z0-9]+$/i;
export const MAX_SEQUENCE_BYTES = 2 * 1024 * 1024;

const fileOf = (id: string) => path.join(PROJECTS_DIR, `${id}.json`);

export function requireSeqId(id: unknown): string {
  if (typeof id !== 'string' || !SEQ_ID.test(id) || id.length > 80) throw new HttpError('Bad sequence id.', 400);
  return id;
}

/** Shape check shared by save and export. Throws a 400 naming the first problem. */
export function validateSequence(raw: unknown): NleSequence {
  const s = raw as Partial<NleSequence> | null;
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new HttpError('sequence must be an object.', 400);
  if (s.v !== 1) throw new HttpError('sequence.v must be 1.', 400);
  requireSeqId(s.id);
  if (typeof s.name !== 'string') throw new HttpError('sequence.name must be a string.', 400);
  if (!Array.isArray(s.tracks) || !Array.isArray(s.clips) || !Array.isArray(s.markers)) throw new HttpError('sequence.tracks, clips and markers must be arrays.', 400);
  const okNum = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  if (!okNum(s.width, 16, 8192) || !okNum(s.height, 16, 8192)) throw new HttpError('sequence.width / height must be 16..8192.', 400);
  if (!okNum(s.fps, 1, 120)) throw new HttpError('sequence.fps must be 1..120.', 400);
  for (const t of s.tracks) {
    if (!t || typeof t.id !== 'string' || (t.kind !== 'video' && t.kind !== 'audio')) throw new HttpError('Every track needs an id and kind video|audio.', 400);
  }
  for (const c of s.clips) {
    if (!c || typeof c.id !== 'string' || typeof c.trackId !== 'string') throw new HttpError('Every clip needs an id and trackId.', 400);
    if (!['video', 'image', 'audio', 'text', 'color'].includes(c.kind)) throw new HttpError(`Clip ${c.id}: bad kind.`, 400);
    if (!okNum(c.start, 0, 86_400) || !okNum(c.duration, 0.001, 86_400) || !okNum(c.mediaStart ?? 0, 0, 86_400)) throw new HttpError(`Clip ${c.id}: start / duration / mediaStart out of range.`, 400);
    if (!okNum(c.rate ?? 1, 0.0625, 16)) throw new HttpError(`Clip ${c.id}: rate out of range.`, 400);
  }
  return s as NleSequence;
}

export async function listProjects(): Promise<NleProjectSummary[]> {
  let names: string[] = [];
  try {
    names = (await fs.readdir(PROJECTS_DIR)).filter((n) => n.endsWith('.json') && SEQ_ID.test(n.slice(0, -5)));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const rows = await Promise.all(
    names.map(async (n): Promise<NleProjectSummary | null> => {
      try {
        const s = JSON.parse(await fs.readFile(path.join(PROJECTS_DIR, n), 'utf8')) as NleSequence;
        if (s?.v !== 1 || !Array.isArray(s.clips)) return null;
        return { id: s.id, name: s.name, updatedAt: s.updatedAt, duration: Math.round(sequenceDuration(s) * 1000) / 1000, clips: s.clips.length };
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((r): r is NleProjectSummary => !!r).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

export async function loadProject(id: string): Promise<NleSequence> {
  requireSeqId(id);
  try {
    return JSON.parse(await fs.readFile(fileOf(id), 'utf8')) as NleSequence;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new HttpError('Sequence not found.', 404);
    if (isEvictedError(err)) throw new HttpError(icloudHint(`Sequence ${id}`, fileOf(id)), 409);
    throw new HttpError(`Sequence file is unreadable: ${(err as Error).message}`, 500);
  }
}

export async function saveProject(raw: unknown): Promise<{ ok: true; updatedAt: string }> {
  const s = validateSequence(raw);
  const updatedAt = new Date().toISOString();
  const text = JSON.stringify({ ...s, updatedAt });
  if (Buffer.byteLength(text) > MAX_SEQUENCE_BYTES) throw new HttpError('Sequence is larger than 2 MB.', 413);
  await ensureDir(PROJECTS_DIR);
  await assertFreeSpace(PROJECTS_DIR, { needBytes: Buffer.byteLength(text), what: 'saving the sequence' });
  await writeAtomic(fileOf(s.id), text);
  return { ok: true, updatedAt };
}

export async function deleteProject(id: string): Promise<{ ok: true }> {
  requireSeqId(id);
  await ensureDir(TRASH_DIR);
  try {
    await fs.rename(fileOf(id), path.join(TRASH_DIR, `${id}-${Date.now().toString(36)}.json`));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new HttpError('Sequence not found.', 404);
    throw err;
  }
  return { ok: true };
}
