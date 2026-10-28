import 'server-only';
import { HttpError } from '../http-error';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { GenItemRecord, MediaKind } from '@/types/media';
import { WINDSOR_ROOT, assertFreeSpace, isInside, isWindsorMounted } from '../storage';
import { GEN_ROOT, MANIFEST_PATH } from './config';

export type StorageState = { ok: true; root: string; freeBytes: number } | { ok: false; root: string; reason: string };

/** Drive mounted (a real mount, not a leftover directory) with the shared free-space floor left? Never creates anything. */
export async function checkStorage(): Promise<StorageState> {
  const fail = (reason: string): StorageState => ({ ok: false, root: GEN_ROOT, reason });
  if (!(await isWindsorMounted())) return fail(`${WINDSOR_ROOT} is not mounted. Plug in the Windsor drive; nothing is written to the boot disk.`);
  try {
    return { ok: true, root: GEN_ROOT, freeBytes: await assertFreeSpace(WINDSOR_ROOT, { what: 'new generations' }) };
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

const pad = (n: number) => String(n).padStart(2, '0');
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const todayDir = () => path.join(GEN_ROOT, localDate());

/** Reserve an id + file path under GEN_ROOT/YYYY-MM-DD/ (creates the directories; storage must already be checked). */
export async function allocOutput(kind: MediaKind, ext: string): Promise<{ id: string; file: string }> {
  const dir = todayDir();
  await fs.mkdir(dir, { recursive: true });
  const id = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
  const d = new Date();
  const stamp = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return { id, file: path.join(dir, `${stamp}-${kind}-${id}.${ext.replace(/[^a-z0-9]/gi, '')}`) };
}

export async function appendManifest(rec: GenItemRecord): Promise<void> {
  await fs.mkdir(GEN_ROOT, { recursive: true });
  await fs.appendFile(MANIFEST_PATH, `${JSON.stringify(rec)}\n`, 'utf8');
}

let cache: { key: string; rows: GenItemRecord[] } | null = null;

/** All manifest rows in file order (oldest first). Bad lines are skipped. */
export async function readManifest(): Promise<GenItemRecord[]> {
  try {
    const st = await fs.stat(MANIFEST_PATH);
    const key = `${st.mtimeMs}:${st.size}`;
    if (cache?.key === key) return cache.rows;
    const text = await fs.readFile(MANIFEST_PATH, 'utf8');
    const rows: GenItemRecord[] = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as GenItemRecord;
        if (r && typeof r.id === 'string' && typeof r.file === 'string') rows.push(r);
      } catch {
        // skip a torn line
      }
    }
    cache = { key, rows };
    return rows;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function listItems(limit = 300): Promise<GenItemRecord[]> {
  const rows = await readManifest();
  return rows.slice(-limit).reverse();
}

/** Sum of est cost for records created on the local calendar day. */
export async function todaySpendUsd(): Promise<number> {
  const today = localDate();
  const rows = await readManifest();
  let sum = 0;
  for (const r of rows) if (localDate(new Date(r.created)) === today) sum += r.estUsd || 0;
  return Math.round(sum * 1e6) / 1e6;
}

/** Resolve a manifest id to a file that is verifiably inside GEN_ROOT (symlinks and `..` resolved). Never trusts client paths. */
export async function resolveFile(id: string): Promise<{ rec: GenItemRecord; file: string; size: number }> {
  if (!/^[a-z0-9-]{6,40}$/i.test(id)) throw new HttpError('Bad id.', 400);
  const rec = (await readManifest()).find((r) => r.id === id);
  if (!rec) throw new HttpError('Not found.', 404);
  const real = await fs.realpath(rec.file).catch(() => {
    throw new HttpError('File is missing (is the Windsor drive mounted?).', 404);
  });
  if (!(await isInside(real, GEN_ROOT))) throw new HttpError('Path escapes the generations root.', 403);
  const st = await fs.stat(real);
  if (!st.isFile()) throw new HttpError('Not a file.', 404);
  return { rec, file: real, size: st.size };
}

export function mimeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    default:
      return 'application/octet-stream';
  }
}

/** Sniff an image container from magic bytes (falls back to png). */
export function sniffImageExt(buf: Buffer): string {
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return 'png';
}
