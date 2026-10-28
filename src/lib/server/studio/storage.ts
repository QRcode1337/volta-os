import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { StudioStorage } from '@/types/studio';
import { HttpError } from '../http-error';

// VOLTA Studio writes ONLY to the Windsor drive by default (renders, logs, job history). Nothing goes to the boot disk.
export const STUDIO_MOUNT = '/Volumes/Windsor';
export const STUDIO_ROOT = '/Volumes/Windsor/VOLTA/studio';
export const RENDERS_ROOT = `${STUDIO_ROOT}/renders`;
export const LOGS_DIR = `${STUDIO_ROOT}/logs`;
export const JOBS_FILE = `${STUDIO_ROOT}/jobs.jsonl`;
export const COMPOSITIONS_CACHE = `${STUDIO_ROOT}/compositions-cache.json`;
export const MIN_FREE_BYTES = 3 * 1024 ** 3;
const GiB = 1024 ** 3;

/** Is Windsor a real mount (not a leftover directory on the boot disk)? */
export async function windsorMounted(): Promise<boolean> {
  try {
    const [mount, volumes] = await Promise.all([fs.stat(STUDIO_MOUNT), fs.stat('/Volumes')]);
    return mount.isDirectory() && mount.dev !== volumes.dev;
  } catch {
    return false;
  }
}

/** Mounted and >= 3 GiB free? Never creates anything. */
export async function checkStudioStorage(): Promise<StudioStorage> {
  const fail = (reason: string, freeBytes: number | null = null): StudioStorage => ({ ok: false, root: STUDIO_ROOT, freeBytes, reason });
  if (!(await windsorMounted())) return fail(`${STUDIO_MOUNT} is not mounted. Plug in the Windsor drive; Studio writes nothing to the boot disk.`);
  try {
    const s = await fs.statfs(STUDIO_MOUNT);
    const freeBytes = Number(s.bavail) * Number(s.bsize);
    if (freeBytes < MIN_FREE_BYTES) {
      return fail(`Windsor has only ${(freeBytes / GiB).toFixed(1)} GiB free (renders need at least ${MIN_FREE_BYTES / GiB} GiB). Free some space first.`, freeBytes);
    }
    return { ok: true, root: STUDIO_ROOT, freeBytes, reason: null };
  } catch (err) {
    return fail(`Cannot check ${STUDIO_MOUNT}: ${(err as Error).message}`);
  }
}

/** Throws a clear 507 when Windsor is unusable. */
export async function requireStudioStorage(): Promise<void> {
  const s = await checkStudioStorage();
  if (!s.ok) throw new HttpError(s.reason ?? 'Windsor is unavailable.', 507);
}

/** Create the studio folders (only when Windsor is really mounted). */
export async function ensureStudioDirs(projectId?: string): Promise<void> {
  if (!(await windsorMounted())) throw new HttpError(`${STUDIO_MOUNT} is not mounted.`, 507);
  await fs.mkdir(LOGS_DIR, { recursive: true });
  await fs.mkdir(projectId ? path.join(RENDERS_ROOT, projectId) : RENDERS_ROOT, { recursive: true });
}

export const projectRendersDir = (projectId: string) => path.join(RENDERS_ROOT, projectId);

/** realpath of `p` is `root` itself or below it. */
export async function isInside(p: string, root: string): Promise<boolean> {
  try {
    const [rp, rr] = await Promise.all([fs.realpath(p), fs.realpath(root)]);
    return rp === rr || rp.startsWith(rr + path.sep);
  } catch {
    return false;
  }
}
