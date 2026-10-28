import 'server-only';
import { HttpError } from '../http-error';
import fs from 'node:fs/promises';
import { WINDSOR_ROOT, isWindsorMounted, onWindsor, requireWindsor, serialised, writeAtomic } from '../storage';
import type { TrackMeta } from '@/components/music/types';
import { cached } from '../sources/cache';
import { loadConfig } from './config';

// Per-track notes: lyrics, credits, Suno link, mood tags, BPM, key. One JSON file on the Windsor drive:
//   { version: 1, updatedAt, tracks: { "<rootId>/<relative path>": TrackMeta } }
// Keyed by root id + relative path so renaming the root folder on disk does not orphan the notes.

const LIMITS = { lyrics: 100_000, notes: 20_000, title: 200, credit: 60, credits: 12, tag: 40, tags: 20, key: 16, url: 500 };

export interface MetaStore {
  tracks: Record<string, TrackMeta>;
  ok: boolean;
  reason: string | null;
  path: string;
}

async function readFromDisk(file: string): Promise<Record<string, TrackMeta>> {
  const text = await fs.readFile(file, 'utf8');
  const j = JSON.parse(text) as { tracks?: unknown };
  const out: Record<string, TrackMeta> = {};
  if (j && typeof j.tracks === 'object' && j.tracks && !Array.isArray(j.tracks)) {
    for (const [k, v] of Object.entries(j.tracks as Record<string, unknown>)) if (v && typeof v === 'object') out[k] = v as TrackMeta;
  }
  return out;
}

/** Never throws: an unmounted drive or a missing file is an empty store with a reason. */
export async function readMeta(): Promise<MetaStore> {
  const file = loadConfig().metaPath; // configurable: only a file on Windsor depends on the drive being mounted
  if (onWindsor(file) && !(await isWindsorMounted())) {
    return { tracks: {}, ok: false, reason: `${WINDSOR_ROOT} is not mounted. Notes are read-only (empty) until the Windsor drive is plugged in.`, path: file };
  }
  try {
    // No TTL: only a change to the file (including our own writes) invalidates it.
    const tracks = await cached(`music-meta:${file}`, Infinity, () => readFromDisk(file), { mtimeOf: [file] });
    return { tracks, ok: true, reason: null, path: file };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { tracks: {}, ok: true, reason: null, path: file };
    return { tracks: {}, ok: false, reason: `${file} is unreadable: ${(err as Error).message}. Fix or remove it; saving is disabled so nothing is overwritten.`, path: file };
  }
}

function cleanStrings(v: unknown, field: string, maxItems: number, maxLen: number): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new HttpError(`${field} must be a list.`, 400);
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') throw new HttpError(`${field} must be a list of text.`, 400);
    const t = item.trim().replace(/\s+/g, ' ');
    if (!t) continue;
    if (t.length > maxLen) throw new HttpError(`A ${field} entry is longer than ${maxLen} characters.`, 400);
    if (!out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  if (out.length > maxItems) throw new HttpError(`At most ${maxItems} ${field} entries.`, 400);
  return out;
}

function text(v: unknown, field: string, max: number, trim = true): string {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new HttpError(`${field} must be text.`, 400);
  if (v.length > max) throw new HttpError(`${field} is too long (max ${max} characters).`, 400);
  return trim ? v.trim() : v.replace(/\s+$/, '');
}

/** Validates a client-supplied meta object; returns a clean one (empty fields dropped). */
export function sanitizeMeta(raw: unknown): TrackMeta {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError('meta must be an object.', 400);
  const r = raw as Record<string, unknown>;
  const out: TrackMeta = {};
  const title = text(r.title, 'title', LIMITS.title);
  if (title) out.title = title;
  const lyrics = text(r.lyrics, 'lyrics', LIMITS.lyrics, false);
  if (lyrics.trim()) out.lyrics = lyrics;
  const notes = text(r.notes, 'notes', LIMITS.notes, false);
  if (notes.trim()) out.notes = notes;
  const credits = cleanStrings(r.credits, 'credits', LIMITS.credits, LIMITS.credit);
  if (credits.length) out.credits = credits;
  const tags = cleanStrings(r.tags, 'tags', LIMITS.tags, LIMITS.tag);
  if (tags.length) out.tags = tags;
  const url = text(r.sunoUrl, 'sunoUrl', LIMITS.url);
  if (url) {
    let ok = false;
    try {
      const u = new URL(url);
      ok = u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      ok = false;
    }
    if (!ok) throw new HttpError('The Suno link must be a full http(s) URL.', 400);
    out.sunoUrl = url;
  }
  const key = text(r.key, 'key', LIMITS.key);
  if (key) out.key = key;
  if (r.bpm !== undefined && r.bpm !== null && r.bpm !== '') {
    const n = typeof r.bpm === 'number' ? r.bpm : Number(r.bpm);
    if (!Number.isFinite(n) || n < 20 || n > 400) throw new HttpError('BPM must be a number between 20 and 400.', 400);
    out.bpm = Math.round(n * 10) / 10;
  }
  return out;
}

/** Replace (or, when empty, remove) one track's notes. Serialised so concurrent saves cannot lose each other. */
export async function writeTrackMeta(metaKey: string, meta: TrackMeta): Promise<TrackMeta | null> {
  const file = loadConfig().metaPath;
  return serialised(file, async (): Promise<TrackMeta | null> => {
    if (onWindsor(file)) await requireWindsor('notes');
    let tracks: Record<string, TrackMeta> = {};
    try {
      tracks = await readFromDisk(file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new HttpError(`${file} is unreadable (${(err as Error).message}); refusing to overwrite it.`, 500);
      }
    }
    const empty = Object.keys(meta).length === 0;
    let saved: TrackMeta | null = null;
    if (empty) delete tracks[metaKey];
    else {
      saved = { ...meta, updatedAt: new Date().toISOString() };
      tracks[metaKey] = saved;
    }
    await writeAtomic(file, `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), tracks }, null, 2)}\n`);
    return saved;
  });
}
