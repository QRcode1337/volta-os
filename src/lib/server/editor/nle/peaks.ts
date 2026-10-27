import 'server-only';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { NlePeaks } from '@/types/nle';
import { resolveAsset } from './assets';
import { CACHE_DIR, FFMPEG, NleError, ensureDir, limiter, pruneCache, sha1, writeAtomic } from './paths';

// Waveform peaks: decode to mono 4 kHz s16 and keep max |sample| per 1/50 s bucket (0..1, absolute, not normalised to
// the file's loudest peak). Cached as JSON keyed by asset id + size + mtime.

const RATE = 50;
const SR = 4000;
const PER_BUCKET = SR / RATE;
const run = limiter(2);
const inflight = new Map<string, Promise<NlePeaks>>();

export async function getPeaks(id: string): Promise<NlePeaks> {
  const a = await resolveAsset(id);
  if (a.media === 'image' || !a.hasAudio) throw new NleError('This asset has no audio stream.', 404);
  const key = sha1(`peaks|v1|${a.id}|${a.path}|${a.size}|${Math.round(a.mtimeMs)}`);
  const file = path.join(CACHE_DIR, `peaks_${key}.json`);
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as NlePeaks;
  } catch {
    // not cached
  }
  let p = inflight.get(key);
  if (!p) {
    p = run(() => computePeaks(a.path)).then(async (res) => {
      await ensureDir(CACHE_DIR);
      await writeAtomic(file, JSON.stringify(res));
      void pruneCache();
      return res;
    });
    inflight.set(key, p);
    p.finally(() => inflight.delete(key)).catch(() => undefined);
  }
  return p;
}

function computePeaks(file: string): Promise<NlePeaks> {
  return new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG, ['-v', 'error', '-nostdin', '-i', file, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(SR), '-f', 's16le', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const peaks: number[] = [];
    let cur = 0;
    let n = 0;
    let carry: Buffer | null = null;
    let total = 0;
    let err = '';
    const timer = setTimeout(() => ff.kill('SIGKILL'), 180_000);
    ff.stdout.on('data', (chunk: Buffer) => {
      let buf = carry ? Buffer.concat([carry, chunk]) : chunk;
      const usable = buf.length - (buf.length % 2);
      carry = usable < buf.length ? buf.subarray(usable) : null;
      buf = buf.subarray(0, usable);
      for (let i = 0; i < buf.length; i += 2) {
        const v = Math.abs(buf.readInt16LE(i));
        if (v > cur) cur = v;
        if (++n === PER_BUCKET) {
          peaks.push(Math.round((cur / 32768) * 1000) / 1000);
          cur = 0;
          n = 0;
        }
      }
      total += buf.length / 2;
    });
    ff.stderr.on('data', (d: Buffer) => {
      if (err.length < 4000) err += d.toString();
    });
    ff.on('error', (e) => {
      clearTimeout(timer);
      reject(new NleError(`ffmpeg failed to start: ${e.message}`, 500));
    });
    ff.on('close', (code) => {
      clearTimeout(timer);
      if (n > 0) peaks.push(Math.round((cur / 32768) * 1000) / 1000);
      if (code !== 0 && total === 0) {
        const msg = err.trim().split('\n').pop() ?? 'unknown error';
        return reject(new NleError(/matches no streams|does not contain any stream/i.test(err) ? 'This asset has no audio stream.' : `Waveform decode failed: ${msg.slice(0, 200)}`, /matches no streams/i.test(err) ? 404 : 500));
      }
      resolve({ rate: RATE, peaks, duration: Math.round((total / SR) * 1000) / 1000 });
    });
  });
}
