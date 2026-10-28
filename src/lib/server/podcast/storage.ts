import 'server-only';
import { HttpError } from '../http-error';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { EpisodeRecord, Manifest } from './types';
import { MIN_FREE_BYTES, MOUNT_POINT, PODCAST_ROOT } from './config';
import { isDate } from './util';

const GiB = 1024 ** 3;

export type StorageState = { ok: true; root: string; freeBytes: number } | { ok: false; root: string; reason: string };

/** Windsor mounted (a real mount, not a leftover directory) and >= 2 GiB free? Never creates anything. */
export async function checkStorage(): Promise<StorageState> {
  const fail = (reason: string): StorageState => ({ ok: false, root: PODCAST_ROOT, reason });
  try {
    const [mount, volumes] = await Promise.all([fs.stat(MOUNT_POINT), fs.stat('/Volumes')]);
    if (!mount.isDirectory() || mount.dev === volumes.dev) {
      return fail(`${MOUNT_POINT} is not mounted. Plug in the Windsor drive; nothing is written to the boot disk.`);
    }
    const s = await fs.statfs(MOUNT_POINT);
    const freeBytes = Number(s.bavail) * Number(s.bsize);
    if (freeBytes < MIN_FREE_BYTES) {
      return fail(`Windsor has only ${(freeBytes / GiB).toFixed(1)} GiB free (need at least ${MIN_FREE_BYTES / GiB} GiB). Free some space first.`);
    }
    return { ok: true, root: PODCAST_ROOT, freeBytes };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fail(`${MOUNT_POINT} is not mounted. Plug in the Windsor drive; nothing is written to the boot disk.`);
    return fail(`Cannot check ${MOUNT_POINT}: ${(err as Error).message}`);
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

/** Atomic write: temp file in the same directory, then rename. */
export async function writeFileAtomic(file: string, data: string | Buffer): Promise<void> {
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

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
  await writeFileAtomic(MANIFEST_PATH, `${JSON.stringify(m, null, 2)}\n`);
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
  const dir = paths(date).cacheDir;
  await fs.mkdir(dir, { recursive: true });
  await writeFileAtomic(path.join(dir, name), JSON.stringify(value, null, 2));
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
