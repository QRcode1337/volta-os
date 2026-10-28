import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { StudioStorage } from '@/types/studio';
import { GiB, MIN_FREE_BYTES, WINDSOR_ROOT, WINDSOR_VOLTA, assertFreeSpace, freeBytes, isWindsorMounted, requireWindsor } from '../storage';

// VOLTA Studio writes ONLY to the Windsor drive by default (renders, logs, job history). Nothing goes to the boot disk.
export const STUDIO_ROOT = path.join(WINDSOR_VOLTA, 'studio');
export const RENDERS_ROOT = `${STUDIO_ROOT}/renders`;
export const LOGS_DIR = `${STUDIO_ROOT}/logs`;
export const JOBS_FILE = `${STUDIO_ROOT}/jobs.jsonl`;
export const COMPOSITIONS_CACHE = `${STUDIO_ROOT}/compositions-cache.json`;

/** Mounted and >= 3 GiB free? Never creates anything. */
export async function checkStudioStorage(): Promise<StudioStorage> {
  const fail = (reason: string, free: number | null = null): StudioStorage => ({ ok: false, root: STUDIO_ROOT, freeBytes: free, reason });
  if (!(await isWindsorMounted())) return fail(`${WINDSOR_ROOT} is not mounted. Plug in the Windsor drive; Studio writes nothing to the boot disk.`);
  try {
    const free = await freeBytes(WINDSOR_ROOT);
    if (free < MIN_FREE_BYTES) {
      return fail(`Windsor has only ${(free / GiB).toFixed(1)} GiB free (renders need at least ${MIN_FREE_BYTES / GiB} GiB). Free some space first.`, free);
    }
    return { ok: true, root: STUDIO_ROOT, freeBytes: free, reason: null };
  } catch (err) {
    return fail(`Cannot check ${WINDSOR_ROOT}: ${(err as Error).message}`);
  }
}

/** Throws a clear 507 when Windsor is unmounted or has under 3 GiB free. */
export async function requireStudioStorage(): Promise<void> {
  await requireWindsor('Studio renders');
  await assertFreeSpace(WINDSOR_ROOT, { what: 'Studio renders' });
}

/** Create the studio folders (only when Windsor is really mounted). */
export async function ensureStudioDirs(projectId?: string): Promise<void> {
  await requireWindsor('Studio renders');
  await fs.mkdir(LOGS_DIR, { recursive: true });
  await fs.mkdir(projectId ? path.join(RENDERS_ROOT, projectId) : RENDERS_ROOT, { recursive: true });
}

export const projectRendersDir = (projectId: string) => path.join(RENDERS_ROOT, projectId);
