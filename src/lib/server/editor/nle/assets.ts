import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from '../../http-error';
import { describeEditorMedia } from '../media';
import { probeFile } from '../../studio/index-projects';
import { UPLOADS_DIR } from './paths';
import { isEvicted } from '@/lib/server/icloud';
import { MEDIA_BY_EXT, icloudHint, parseMediaId, type MediaKind } from '@/lib/media-ids';

// Asset ids → files on disk. The browser only ever sends ids: o_/g_/m_ resolve through the Editor media bin
// (Studio outputs, Generations, music); u_ through the Edit-mode uploads folder. Raw paths are never accepted.

export type NleMedia = MediaKind;

export interface NleAsset {
  id: string;
  path: string;
  name: string;
  media: NleMedia;
  size: number;
  mtimeMs: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudio: boolean;
}

export interface UploadMeta {
  name: string;
  media: NleMedia;
  ext: string;
  createdAt: string;
}

/** The stored file of an upload id (u_<hex>.<ext>) plus its sidecar meta. */
export async function uploadFile(rawId: string): Promise<{ path: string; meta: UploadMeta; size: number; mtimeMs: number }> {
  const p = parseMediaId(rawId);
  if (p?.kind !== 'u') throw new HttpError('Bad upload id.', 400);
  const id = p.id;
  let meta: UploadMeta;
  try {
    meta = JSON.parse(await fs.readFile(path.join(UPLOADS_DIR, `${id}.json`), 'utf8')) as UploadMeta;
  } catch {
    throw new HttpError('Upload not found.', 404);
  }
  if (!MEDIA_BY_EXT[meta.ext]) throw new HttpError('Upload has an unknown type.', 500);
  const file = path.join(UPLOADS_DIR, `${id}.${meta.ext}`);
  const st = await fs.stat(file).catch(() => null);
  if (!st?.isFile()) throw new HttpError('Upload file is missing.', 404);
  return { path: file, meta, size: st.size, mtimeMs: st.mtimeMs };
}

/** Resolve an asset id to a readable local file with probe info. Offline iCloud placeholders are refused (409). */
export async function resolveAsset(rawId: string): Promise<NleAsset> {
  if (typeof rawId !== 'string') throw new HttpError('Bad asset id.', 400);
  const p = parseMediaId(rawId);
  if (!p) throw new HttpError(`Bad asset id: ${rawId.slice(0, 40)}`, 400);
  const id = p.id;
  if (p.kind === 'u') {
    const u = await uploadFile(id);
    const pr = await probeFile(u.path, u.size, u.mtimeMs);
    const still = u.meta.media === 'image';
    return {
      id: rawId, // callers key assets by the id they sent
      path: u.path,
      name: u.meta.name,
      media: u.meta.media,
      size: u.size,
      mtimeMs: u.mtimeMs,
      durationSec: still ? null : pr.durationSec,
      width: pr.width,
      height: pr.height,
      fps: still ? null : pr.fps,
      hasAudio: u.meta.media === 'audio' || (!still && pr.hasAudio),
    };
  }
  const item = await describeEditorMedia(id);
  if (item.offline) throw new HttpError(icloudHint(`"${item.name}"`, item.path), 409);
  const st = await fs.stat(item.path).catch(() => null);
  if (!st?.isFile()) throw new HttpError(`"${item.name}" is missing on disk (is the drive mounted?).`, 404);
  if (isEvicted(st)) throw new HttpError(`"${item.name}" is an iCloud placeholder that is not downloaded.`, 409);
  const media = item.media as NleMedia;
  // the bin skips probing for some sources (music): probe here so fps / size / audio are known
  const pr = item.width != null || media === 'audio' ? null : await probeFile(item.path, st.size, st.mtimeMs);
  const still = media === 'image';
  return {
    id: rawId,
    path: item.path,
    name: item.name,
    media,
    size: st.size,
    mtimeMs: st.mtimeMs,
    durationSec: still ? null : (item.durationSec ?? pr?.durationSec ?? null),
    width: item.width ?? pr?.width ?? null,
    height: item.height ?? pr?.height ?? null,
    fps: still ? null : (item.fps ?? pr?.fps ?? null),
    hasAudio: media === 'audio' || (!still && (item.hasAudio || !!pr?.hasAudio)),
  };
}
