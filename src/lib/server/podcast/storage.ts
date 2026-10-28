import 'server-only';
import { HttpError } from '../http-error';
import fs from 'node:fs/promises';
import path from 'node:path';
import { WINDSOR_ROOT, assertFreeSpace, isWindsorMounted, writeAtomic } from '../storage';
import type { EpisodeRecord, Manifest } from './types';
import { PODCAST_ROOT } from './config';
import { isDate } from './util';

export type StorageState = { ok: true; root: string; freeBytes: number } | { ok: false; root: string; reason: string };

/** Windsor mounted (a real mount, not a leftover directory) with the shared free-space floor left? Never creates anything. */
export async function checkStorage(): Promise<StorageState> {
  const fail = (reason: string): StorageState => ({ ok: false, root: PODCAST_ROOT, reason });
  if (!(await isWindsorMounted())) return fail(`${WINDSOR_ROOT} is not mounted. Plug in the Windsor drive; nothing is written to the boot disk.`);
  try {
    return { ok: true, root: PODCAST_ROOT, freeBytes: await assertFreeSpace(WINDSOR_ROOT, { what: 'new episodes' }) };
  } catch (err) {
    return fail(err instanceof HttpError ? `${err.message} Free some space first.` : `Cannot check ${WINDSOR_ROOT}: ${(err as Error).message}`);
  }
}

/** Throws a clear 507 when storage is unusable. */
export async function requireStorage(): Promise<{ root: string; freeBytes: number }> {
  const s = await checkStorage();
  if (!s.ok) throw new HttpError(s.reason, 507);
  return s;
}

export const paths = (date: string) => ({
  mp3: path.join(PODCAST_ROOT, `${date}.mp3`),
  notes: path.join(PODCAST_ROOT, `${date}.md`),
  script: path.join(PODCAST_ROOT, `${date}.script.txt`),
  cacheDir: path.join(PODCAST_ROOT, 'cache', date),
  workDir: path.join(PODCAST_ROOT, '.work', date),
});
export const MANIFEST_PATH = path.join(PODCAST_ROOT, 'manifest.json');

export async function readManifest(): Promise<Manifest> {
  try {
    const m = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8')) as Manifest;
    if (m && Array.isArray(m.episodes)) return { version: 1, episodes: m.episodes.filter((e) => isDate(e?.date)) };
  } catch {
    // missing or torn: start empty
  }
  return { version: 1, episodes: [] };
}

/** Newest first. */
export async function listEpisodes(): Promise<EpisodeRecord[]> {
  return (await readManifest()).episodes.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getEpisode(date: string): Promise<EpisodeRecord | null> {
  if (!isDate(date)) return null;
  return (await readManifest()).episodes.find((e) => e.date === date) ?? null;
}

/** Insert or replace the episode for its date. Callers must have passed requireStorage(). */
export async function upsertEpisode(ep: EpisodeRecord): Promise<void> {
  const m = await readManifest();
  m.episodes = [...m.episodes.filter((e) => e.date !== ep.date), ep].sort((a, b) => b.date.localeCompare(a.date));
  await writeAtomic(MANIFEST_PATH, `${JSON.stringify(m, null, 2)}\n`);
}

export async function readText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

export async function readCacheJson<T>(date: string, name: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(paths(date).cacheDir, name), 'utf8')) as T;
  } catch {
    return null;
  }
}
export async function writeCacheJson(date: string, name: string, value: unknown): Promise<void> {
  await writeAtomic(path.join(paths(date).cacheDir, name), JSON.stringify(value, null, 2));
}

/** Remove research caches older than `keepDays` and stale work dirs. Best-effort. */
export async function pruneOld(keepDays = 14): Promise<void> {
  const cutoff = Date.now() - keepDays * 86_400_000;
  for (const sub of ['cache', '.work']) {
    const dir = path.join(PODCAST_ROOT, sub);
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const n of names) {
      if (!isDate(n)) continue;
      if (new Date(`${n}T12:00:00`).getTime() < cutoff) await fs.rm(path.join(dir, n), { recursive: true, force: true }).catch(() => {});
    }
  }
}
