import 'server-only';
import { randomBytes } from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HttpError } from './http-error';

// The one place VOLTA decides where bulky state lives and how it is written. Windsor (the external drive) holds
// renders, generations, podcasts, feeds and other growing data; the boot disk is near-full, so nothing that grows
// falls back to it silently. iCloud placeholder checks stay in icloud.ts.

/** Windsor mount point (VOLTA_WINDSOR overrides it). */
export const WINDSOR_ROOT = (process.env.VOLTA_WINDSOR ?? '').trim() || '/Volumes/Windsor';
/** VOLTA's own folder on Windsor. */
export const WINDSOR_VOLTA = path.join(WINDSOR_ROOT, 'VOLTA');

export const GiB = 1024 ** 3;
/** Free space that must remain on a volume after a write. */
export const MIN_FREE_BYTES = 3 * GiB;

/**
 * True only when a real volume is mounted at `mountPoint`. A leftover empty folder under /Volumes (after an unclean
 * eject) shares /Volumes' device id, so a plain exists() check would wrongly say it is mounted. Never creates it.
 */
export async function volumeMounted(mountPoint: string): Promise<boolean> {
  try {
    const [m, v] = await Promise.all([fs.stat(mountPoint), fs.stat('/Volumes')]);
    return m.isDirectory() && m.dev !== v.dev;
  } catch {
    return false;
  }
}

export const isWindsorMounted = () => volumeMounted(WINDSOR_ROOT);

/** `p` is on Windsor (the mount point itself or below it). */
export const onWindsor = (p: string) => p === WINDSOR_ROOT || p.startsWith(WINDSOR_ROOT + path.sep);

/** 507 unless Windsor is really mounted. `what` names the thing that needs it ("Studio renders"). */
export async function requireWindsor(what: string): Promise<void> {
  if (!(await isWindsorMounted())) throw new HttpError(`${WINDSOR_ROOT} is not mounted, so ${what} cannot be saved. Plug in the Windsor drive; nothing is written to the boot disk instead.`, 507);
}

/** Free bytes on the volume holding `p` (walks up to the nearest existing ancestor). */
export async function freeBytes(p: string): Promise<number> {
  let dir = p;
  for (;;) {
    try {
      const s = await fs.statfs(dir);
      return Number(s.bavail) * Number(s.bsize);
    } catch (err) {
      const parent = path.dirname(dir);
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT' || parent === dir) throw err;
      dir = parent;
    }
  }
}

/** 507 when writing `needBytes` into `dir` would leave less than MIN_FREE_BYTES free on that volume. Returns free bytes. */
export async function assertFreeSpace(dir: string, { needBytes = 0, what = 'this write' }: { needBytes?: number; what?: string } = {}): Promise<number> {
  const free = await freeBytes(dir);
  if (free - needBytes < MIN_FREE_BYTES) {
    throw new HttpError(
      `Not enough disk space for ${what}: ${(free / GiB).toFixed(1)} GiB free on the volume holding ${tilde(dir)}` +
        (needBytes > 0 ? ` and this needs about ${(needBytes / GiB).toFixed(2)} GiB` : '') +
        `; at least ${MIN_FREE_BYTES / GiB} GiB must remain free.`,
      507,
    );
  }
  return free;
}

export const tilde = (p: string) => (p === os.homedir() || p.startsWith(os.homedir() + path.sep) ? `~${p.slice(os.homedir().length)}` : p);

/** realpath of `p` is `root` itself or below it (false when either is missing). */
export async function isInside(p: string, root: string): Promise<boolean> {
  try {
    const [rp, rr] = await Promise.all([fs.realpath(p), fs.realpath(root)]);
    return rp === rr || rp.startsWith(rr + path.sep);
  } catch {
    return false;
  }
}

const tmpFor = (file: string) => `${file}.volta-${process.pid}-${randomBytes(4).toString('hex')}.tmp`;

/**
 * Write a file atomically: tmp file in the same directory, then rename, so a crash never leaves it truncated.
 * Keeps the existing file's mode. With `expectMtimeMs`, refuses (409) if the file changed since it was read.
 */
export async function writeAtomic(file: string, data: string | Uint8Array, { expectMtimeMs }: { expectMtimeMs?: number } = {}): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const before = await fs.stat(file).catch(() => null);
  const tmp = tmpFor(file);
  try {
    await fs.writeFile(tmp, data);
    if (before) await fs.chmod(tmp, before.mode & 0o7777);
    if (expectMtimeMs !== undefined) {
      const now = await fs.stat(file).catch(() => null);
      if ((now?.mtimeMs ?? -1) !== expectMtimeMs) throw new HttpError(`${tilde(file)} changed while saving (another process is editing it). Refresh and try again.`, 409);
    }
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

/** writeAtomic for the few synchronous config writers. */
export function writeAtomicSync(file: string, data: string | Uint8Array): void {
  fsSync.mkdirSync(path.dirname(file), { recursive: true });
  const mode = (() => {
    try {
      return fsSync.statSync(file).mode & 0o7777;
    } catch {
      return null;
    }
  })();
  const tmp = tmpFor(file);
  try {
    fsSync.writeFileSync(tmp, data);
    if (mode !== null) fsSync.chmodSync(tmp, mode);
    fsSync.renameSync(tmp, file);
  } catch (err) {
    fsSync.rmSync(tmp, { force: true });
    throw err;
  }
}

const chains = new Map<string, Promise<unknown>>();

/**
 * Run `fn` after every earlier `serialised` call for the same `key` (usually a file path) settles, so concurrent
 * read-modify-writes apply in order. One failure doesn't block the next. The map entry is dropped when idle.
 */
export function serialised<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (chains.get(key) ?? Promise.resolve()).then(fn, fn);
  const tail = run.catch(() => undefined);
  chains.set(key, tail);
  void tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key);
  });
  return run;
}

/**
 * A JSON document on disk: `read()` re-reads only when the file's mtime changed; `update(fn)` is serialised per file
 * and written atomically. A missing file reads as `fallback()`.
 */
export function jsonFile<T>(file: string, fallback: () => T) {
  let cache: { mtimeMs: number; value: T } | null = null;
  async function read(): Promise<T> {
    const st = await fs.stat(file).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') return null;
      throw err;
    });
    if (!st) return fallback();
    if (cache?.mtimeMs !== st.mtimeMs) cache = { mtimeMs: st.mtimeMs, value: JSON.parse(await fs.readFile(file, 'utf8')) as T };
    return cache.value;
  }
  function update(mutate: (value: T) => T | void): Promise<T> {
    return serialised(file, async () => {
      const current = structuredClone(await read());
      const next = (mutate(current) ?? current) as T;
      await writeAtomic(file, `${JSON.stringify(next, null, 2)}\n`);
      cache = { mtimeMs: (await fs.stat(file)).mtimeMs, value: next };
      return next;
    });
  }
  return { file, read, update };
}
