import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describeEditorMedia } from '../media';
import { probeFile } from '../../studio/index-projects';
import { NleError, UPLOADS_DIR } from './paths';
import { isEvicted } from '@/lib/server/icloud';

// Asset ids → files on disk. The browser only ever sends ids: o_/g_/m_ resolve through the Editor media bin
// (Studio outputs, Generations, music); u_ through the Edit-mode uploads folder. Raw paths are never accepted.

export type NleMedia = 'video' | 'audio' | 'image';

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

export const UPLOAD_ID = /^u_[0-9a-f]{16}$/;
export const BIN_ID = /^(o_[0-9a-f]{16}|g_[a-z0-9-]{6,40}|m_[0-9a-f]{16})$/i;

export const MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
};
export const MEDIA_BY_EXT: Record<string, NleMedia> = {
  mp4: 'video',
  m4v: 'video',
  mov: 'video',
  webm: 'video',
  mkv: 'video',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  aac: 'audio',
  flac: 'audio',
  ogg: 'audio',
  opus: 'audio',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  heic: 'image',
};

export interface UploadMeta {
  name: string;
  media: NleMedia;
  ext: string;
  createdAt: string;
}

/** The stored file of an upload id (u_<hex>.<ext>) plus its sidecar meta. */
export async function uploadFile(id: string): Promise<{ path: string; meta: UploadMeta; size: number; mtimeMs: number }> {
  if (!UPLOAD_ID.test(id)) throw new NleError('Bad upload id.', 400);
  let meta: UploadMeta;
  try {
    meta = JSON.parse(await fs.readFile(path.join(UPLOADS_DIR, `${id}.json`), 'utf8')) as UploadMeta;
  } catch {
    throw new NleError('Upload not found.', 404);
  }
  if (!MEDIA_BY_EXT[meta.ext]) throw new NleError('Upload has an unknown type.', 500);
  const file = path.join(UPLOADS_DIR, `${id}.${meta.ext}`);
  const st = await fs.stat(file).catch(() => null);
  if (!st?.isFile()) throw new NleError('Upload file is missing.', 404);
  return { path: file, meta, size: st.size, mtimeMs: st.mtimeMs };
}

/** Resolve an asset id to a readable local file with probe info. Offline iCloud placeholders are refused (409). */
export async function resolveAsset(id: string): Promise<NleAsset> {
  if (typeof id !== 'string') throw new NleError('Bad asset id.', 400);
  if (UPLOAD_ID.test(id)) {
    const u = await uploadFile(id);
    const pr = await probeFile(u.path, u.size, u.mtimeMs);
    const still = u.meta.media === 'image';
    return {
      id,
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
  if (!BIN_ID.test(id)) throw new NleError(`Bad asset id: ${String(id).slice(0, 40)}`, 400);
  const item = await describeEditorMedia(id);
  if (item.offline) {
    throw new NleError(`"${item.name}" is an iCloud placeholder that is not downloaded. Download it first (Finder, or: ${item.brctl ?? 'brctl download'}).`, 409);
  }
  const st = await fs.stat(item.path).catch(() => null);
  if (!st?.isFile()) throw new NleError(`"${item.name}" is missing on disk (is the drive mounted?).`, 404);
  if (isEvicted(st)) throw new NleError(`"${item.name}" is an iCloud placeholder that is not downloaded.`, 409);
  const media = item.media as NleMedia;
  // the bin skips probing for some sources (music): probe here so fps / size / audio are known
  const pr = item.width != null || media === 'audio' ? null : await probeFile(item.path, st.size, st.mtimeMs);
  const still = media === 'image';
  return {
    id,
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
