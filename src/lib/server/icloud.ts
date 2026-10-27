import 'server-only';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

// iCloud "Optimize Mac Storage" evicts files to placeholders that keep their size but have no blocks on disk.
// Reading one from this server fails with EDEADLK (or starts a download), so callers check before opening.

/** Stat of an iCloud-evicted placeholder: a size but no allocated blocks. */
export const isEvicted = (st: { size: number; blocks: number }) => st.size > 0 && st.blocks === 0;

/** A regular file that is an iCloud placeholder. Missing files are not evicted. */
export async function isEvictedFile(file: string): Promise<boolean> {
  const st = await fsp.stat(file).catch(() => null);
  return !!st?.isFile() && isEvicted(st);
}

export function isEvictedFileSync(file: string): boolean {
  try {
    const st = fs.statSync(file);
    return st.isFile() && isEvicted(st);
  } catch {
    return false;
  }
}

/** A regular, non-empty file whose bytes are on disk. */
export async function onDisk(file: string): Promise<boolean> {
  const st = await fsp.stat(file).catch(() => null);
  return !!st?.isFile() && st.size > 0 && st.blocks > 0;
}

/** The error a read of an evicted file throws. */
export const isEvictedError = (err: unknown) => (err as NodeJS.ErrnoException)?.code === 'EDEADLK';
