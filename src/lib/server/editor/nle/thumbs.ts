import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from '../../http-error';
import { BIN, run } from '../../proc';
import { resolveAsset } from './assets';
import { CACHE_DIR, ensureDir, limiter, onDisk, pruneCache, sha1 } from './paths';

// Filmstrip sprites for timeline clips: `count` frames tiled horizontally (count x 1), each 90 px tall, frame i sampled
// at (i + 0.5) * duration / count. One ffmpeg call: one fast-seeked input per frame, hstacked. Cached in cache/.

export const FRAME_H = 90;
const limit = limiter(2);
const inflight = new Map<string, Promise<ThumbsMeta>>();

export interface ThumbsMeta {
  url: string;
  count: number;
  frameW: number;
  frameH: number;
  duration: number;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export async function getThumbs(id: string, rawCount: number): Promise<{ meta: ThumbsMeta; file: string; etag: string }> {
  const a = await resolveAsset(id);
  if (a.media === 'audio') throw new HttpError('Audio-only assets have no thumbnails.', 404);
  if (!a.width || !a.height) throw new HttpError('This asset has no video frames.', 404);
  const count = a.media === 'image' ? 1 : Math.max(1, Math.min(40, Math.round(Number.isFinite(rawCount) ? rawCount : 10)));
  const duration = a.media === 'image' ? 0 : (a.durationSec ?? 0);
  const frameW = Math.min(360, even((FRAME_H * a.width) / a.height));
  const key = sha1(`thumbs|v1|${a.id}|${a.path}|${a.size}|${Math.round(a.mtimeMs)}|${count}`);
  const file = path.join(CACHE_DIR, `thumbs_${key}.jpg`);
  const meta: ThumbsMeta = { url: `/api/editor/nle/thumbs?id=${encodeURIComponent(a.id)}&count=${count}&img=1`, count, frameW, frameH: FRAME_H, duration };
  const etag = `"${key}"`;
  if (await onDisk(file)) return { meta, file, etag };
  let p = inflight.get(key);
  if (!p) {
    p = limit(() => buildSprite(a.path, a.media === 'image', count, duration, frameW, file)).then(() => meta);
    inflight.set(key, p);
    p.finally(() => inflight.delete(key)).catch(() => undefined);
  }
  await p;
  return { meta, file, etag };
}

async function buildSprite(src: string, still: boolean, count: number, duration: number, frameW: number, out: string): Promise<void> {
  await ensureDir(CACHE_DIR);
  const args = ['-v', 'error', '-nostdin', '-y'];
  // long sources: keyframes only (fast); short ones: accurate frames (cheap anyway, and keyframes would repeat)
  const fast = !still && duration / count >= 5;
  for (let i = 0; i < count; i++) {
    const t = still ? 0 : Math.max(0, Math.min(duration - 0.05, ((i + 0.5) * duration) / count));
    if (fast) args.push('-skip_frame', 'nokey', '-noaccurate_seek');
    if (!still) args.push('-ss', t.toFixed(3));
    args.push('-i', src);
  }
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    parts.push(
      `[${i}:v:0]trim=end_frame=1,setpts=PTS-STARTPTS,scale=${frameW}:${FRAME_H}:force_original_aspect_ratio=decrease:flags=bilinear,pad=${frameW}:${FRAME_H}:-1:-1:color=black,setsar=1,format=yuvj420p[v${i}]`,
    );
  }
  const graph = count === 1 ? `${parts[0].replace(/\[v0\]$/, '[out]')}` : `${parts.join(';')};${Array.from({ length: count }, (_, i) => `[v${i}]`).join('')}hstack=inputs=${count}[out]`;
  const tmp = `${out}.${Date.now().toString(36)}.tmp`;
  args.push('-filter_complex', graph, '-map', '[out]', '-frames:v', '1', '-q:v', '5', '-f', 'mjpeg', tmp);
  const r = await run(BIN.ffmpeg, args, { timeoutMs: 60_000, maxBuffer: 1024 * 1024 });
  if (r.code !== 0) {
    await fs.rm(tmp, { force: true });
    throw new HttpError(`Thumbnail render failed: ${r.error ?? `exit ${r.code}`}`, 500);
  }
  await fs.rename(tmp, out);
  void pruneCache();
}
