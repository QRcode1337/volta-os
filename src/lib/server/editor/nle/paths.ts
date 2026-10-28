import 'server-only';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WINDSOR_VOLTA, isWindsorMounted } from '../../storage';

// VOLTA Editor — Edit mode storage. Live state (uploads, caches, saved sequences, exports when Windsor is unplugged)
// lives under ~/Library/Application Support/VOLTA/editor/ — NOT in iCloud-synced ErisMornCloud, where macOS evicts
// files and reads then fail with EDEADLK. Exports prefer the Windsor drive. Every bulk write checks free space first
// (assertFreeSpace: >= 3 GiB must remain).

export const NLE_ROOT = path.join(os.homedir(), 'Library/Application Support/VOLTA/editor');
export const UPLOADS_DIR = path.join(NLE_ROOT, 'uploads');
export const CACHE_DIR = path.join(NLE_ROOT, 'cache');
export const PROJECTS_DIR = path.join(NLE_ROOT, 'projects');
export const TRASH_DIR = path.join(PROJECTS_DIR, '.trash');
export const LOCAL_EXPORTS_DIR = path.join(NLE_ROOT, 'exports');
export const WINDSOR_EXPORTS_DIR = path.join(WINDSOR_VOLTA, 'editor', 'exports');

export const FFMPEG = '/opt/homebrew/bin/ffmpeg';
export const FFPROBE = '/opt/homebrew/bin/ffprobe';

export async function ensureDir(dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Where finished exports go: Windsor when it is really mounted, else the local exports folder. */
export async function exportsDir(): Promise<string> {
  return (await isWindsorMounted()) ? WINDSOR_EXPORTS_DIR : LOCAL_EXPORTS_DIR;
}

export { isEvictedError, onDisk } from '@/lib/server/icloud';

export const sha1 = (s: string, n = 20) => createHash('sha1').update(s).digest('hex').slice(0, n);

/** Keep the cache bounded: when it holds more than `maxFiles` files, delete the oldest (by mtime) down to 80 %. */
export async function pruneCache(maxFiles = 3000): Promise<void> {
  try {
    const names = (await fs.readdir(CACHE_DIR, { withFileTypes: true })).filter((d) => d.isFile()).map((d) => d.name);
    if (names.length <= maxFiles) return;
    const stats = await Promise.all(
      names.map(async (n) => {
        const st = await fs.stat(path.join(CACHE_DIR, n)).catch(() => null);
        return { n, m: st?.mtimeMs ?? 0 };
      }),
    );
    stats.sort((a, b) => a.m - b.m);
    for (const s of stats.slice(0, names.length - Math.floor(maxFiles * 0.8))) await fs.rm(path.join(CACHE_DIR, s.n), { force: true });
  } catch {
    // best effort
  }
}

/** Tiny async semaphore (bounds concurrent ffmpeg helpers). */
export function limiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}
