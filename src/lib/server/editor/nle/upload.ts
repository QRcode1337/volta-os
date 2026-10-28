import 'server-only';
import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { NleUploadResult } from '@/types/nle';
import { HttpError } from '../../http-error';
import { probeFile } from '../../studio/index-projects';
import { MEDIA_BY_EXT, type NleMedia, type UploadMeta } from './assets';
import { assertFreeSpace, writeAtomic } from '../../storage';
import { UPLOADS_DIR, ensureDir } from './paths';

// Raw-body upload (not multipart): streamed to uploads/u_<16 hex>.<ext>, capped at 4 GB, then ffprobed.

export const MAX_UPLOAD_BYTES = 4 * 1024 ** 3;
const SPACE_CHECK_EVERY = 256 * 1024 ** 2;

const EXT_BY_TYPE: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'video/x-m4v': 'm4v',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/ogg': 'ogg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
};

function cleanName(raw: string | null): string {
  let name = 'upload';
  if (raw) {
    try {
      name = decodeURIComponent(raw);
    } catch {
      name = raw;
    }
  }
  name = path.basename(name.replace(/\\/g, '/')).replace(/[\u0000-\u001f]/g, '').trim();
  return (name || 'upload').slice(0, 200);
}

export async function receiveUpload(req: Request): Promise<NleUploadResult> {
  const type = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const major = type.split('/')[0] as NleMedia;
  if (!['video', 'audio', 'image'].includes(major)) throw new HttpError('Content-Type must be video/*, audio/* or image/*.', 415);
  const name = cleanName(req.headers.get('x-file-name'));
  const nameExt = path.extname(name).slice(1).toLowerCase();
  const ext = MEDIA_BY_EXT[nameExt] === major ? nameExt : EXT_BY_TYPE[type];
  if (!ext || MEDIA_BY_EXT[ext] !== major) throw new HttpError(`Unsupported ${major} type (${type}${nameExt ? `, .${nameExt}` : ''}).`, 415);
  const declared = Number(req.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) throw new HttpError('Uploads are limited to 4 GB.', 413);
  if (!req.body) throw new HttpError('Empty upload.', 400);

  await ensureDir(UPLOADS_DIR);
  await assertFreeSpace(UPLOADS_DIR, { needBytes: Number.isFinite(declared) ? declared : 0, what: 'this upload' });

  const id = `u_${randomBytes(8).toString('hex')}`;
  const final = path.join(UPLOADS_DIR, `${id}.${ext}`);
  const part = `${final}.part`;
  const out = createWriteStream(part, { flags: 'wx' });
  let written = 0;
  let nextCheck = SPACE_CHECK_EVERY;
  const reader = req.body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      written += value.byteLength;
      if (written > MAX_UPLOAD_BYTES) throw new HttpError('Uploads are limited to 4 GB.', 413);
      if (written >= nextCheck) {
        nextCheck += SPACE_CHECK_EVERY;
        await assertFreeSpace(UPLOADS_DIR, { what: 'the rest of this upload' });
      }
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
    if (written === 0) throw new HttpError('Empty upload.', 400);
  } catch (err) {
    reader.cancel().catch(() => undefined);
    out.destroy();
    await fs.rm(part, { force: true });
    throw err;
  }

  await fs.rename(part, final);
  const st = await fs.stat(final);
  const pr = await probeFile(final, st.size, st.mtimeMs);
  const playable = major === 'audio' ? pr.hasAudio || (pr.durationSec ?? 0) > 0 : !!pr.width && !!pr.height;
  if (!playable) {
    await fs.rm(final, { force: true });
    throw new HttpError(`"${name}" could not be read as ${major === 'image' ? 'an image' : major}.`, 415);
  }
  const meta: UploadMeta = { name, media: major, ext, createdAt: new Date().toISOString() };
  await writeAtomic(path.join(UPLOADS_DIR, `${id}.json`), JSON.stringify(meta));
  const still = major === 'image';
  return {
    assetId: id,
    url: `/api/editor/nle/file?id=${id}`,
    name,
    media: major,
    durationSec: still ? null : pr.durationSec,
    width: major === 'audio' ? null : pr.width,
    height: major === 'audio' ? null : pr.height,
    hasAudio: major === 'audio' || (!still && pr.hasAudio),
    fps: still || major === 'audio' ? null : pr.fps,
  };
}
