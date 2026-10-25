import 'server-only';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ImageModelInfo, VideoModelInfo } from '@/types/media';
import { MediaError, maskSecrets, xaiKey } from './config';
import { TICKS_PER_USD, VIDEO_PRICES, round6 } from './pricing';

const BASE = 'https://api.x.ai/v1';
const CATALOG_TTL_MS = 10 * 60 * 1000;

async function xai(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  const key = xaiKey();
  if (!key) throw new MediaError('Add XAI_API_KEY to ~/Volta-OS/.env.local (then restart VOLTA OS).', 412);
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
  return res;
}

async function xaiJson<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
  const res = await xai(path, init, timeoutMs);
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text) as { error?: unknown; message?: unknown; code?: unknown };
      detail = typeof j.error === 'string' ? j.error : typeof j.message === 'string' ? j.message : JSON.stringify(j.error ?? j);
    } catch {
      // keep raw text
    }
    throw new MediaError(`xAI ${res.status}: ${maskSecrets(detail).slice(0, 400)}`, res.status === 401 || res.status === 403 ? 502 : res.status >= 500 ? 502 : 422);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new MediaError('xAI returned a non-JSON response.', 502);
  }
}

// ── catalog (live; only models that exist are offered) ──

interface RawImageModel {
  id: string;
  image_price?: number;
  max_prompt_length?: number;
  pricing?: { quality: string; resolution: string; price_per_image: number }[];
  output_modalities?: string[];
}
interface RawVideoModel {
  id: string;
}

let imgCache: { at: number; v: ImageModelInfo[] } | null = null;
let vidCache: { at: number; v: VideoModelInfo[] } | null = null;

export async function listImageModels(): Promise<ImageModelInfo[]> {
  if (imgCache && Date.now() - imgCache.at < CATALOG_TTL_MS) return imgCache.v;
  const j = await xaiJson<{ models?: RawImageModel[]; data?: RawImageModel[] }>('/image-generation-models');
  const raw = j.models ?? j.data ?? [];
  const v = raw
    .filter((m) => typeof m.id === 'string' && typeof m.image_price === 'number')
    .map<ImageModelInfo>((m) => ({
      id: m.id,
      priceUsd: round6((m.image_price as number) / TICKS_PER_USD),
      maxPromptLength: m.max_prompt_length ?? 4000,
      tiers: m.pricing?.length
        ? m.pricing.map((p) => ({ quality: p.quality, resolution: p.resolution, priceUsd: round6(p.price_per_image / TICKS_PER_USD) }))
        : undefined,
    }))
    .sort((a, b) => a.priceUsd - b.priceUsd);
  imgCache = { at: Date.now(), v };
  return v;
}

export async function listVideoModels(): Promise<VideoModelInfo[]> {
  if (vidCache && Date.now() - vidCache.at < CATALOG_TTL_MS) return vidCache.v;
  const j = await xaiJson<{ models?: RawVideoModel[]; data?: RawVideoModel[] }>('/video-generation-models');
  const live = new Set((j.models ?? j.data ?? []).map((m) => m.id));
  const v = Object.entries(VIDEO_PRICES)
    .filter(([id]) => live.has(id))
    .map<VideoModelInfo>(([id, perSecondUsd]) => ({ id, perSecondUsd, resolutions: Object.keys(perSecondUsd) }))
    .sort((a, b) => a.perSecondUsd['480p'] - b.perSecondUsd['480p']);
  vidCache = { at: Date.now(), v };
  return v;
}

// ── images ──

export interface GeneratedImage {
  data: Buffer;
}

export async function generateImages(p: {
  model: string;
  prompt: string;
  n: number;
  aspect: string;
  quality?: string;
  resolution?: string;
}): Promise<GeneratedImage[]> {
  const body: Record<string, unknown> = { model: p.model, prompt: p.prompt, n: p.n, aspect_ratio: p.aspect, response_format: 'b64_json' };
  if (p.quality) body.quality = p.quality;
  if (p.resolution) body.resolution = p.resolution;
  const j = await xaiJson<{ data?: { b64_json?: string; url?: string }[] }>('/images/generations', { method: 'POST', body: JSON.stringify(body) }, 180_000);
  const rows = j.data ?? [];
  if (!rows.length) throw new MediaError('xAI returned no images (the prompt may have been moderated).', 502);
  const out: GeneratedImage[] = [];
  for (const r of rows) {
    if (r.b64_json) out.push({ data: Buffer.from(r.b64_json, 'base64') });
    else if (r.url) out.push({ data: await downloadBuffer(r.url) });
  }
  if (!out.length) throw new MediaError('xAI returned images in an unexpected format.', 502);
  return out;
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new MediaError('Refusing a non-https download URL.', 502);
  const res = await fetch(u, { signal: AbortSignal.timeout(120_000) }); // no Authorization header to third-party hosts
  if (!res.ok) throw new MediaError(`Download failed (${res.status}).`, 502);
  return Buffer.from(await res.arrayBuffer());
}

// ── video (async: submit, then poll) ──

export async function submitVideo(p: { model: string; prompt: string; duration: number; aspect: string; resolution: string }): Promise<string> {
  const j = await xaiJson<{ request_id?: string }>('/videos/generations', {
    method: 'POST',
    body: JSON.stringify({ model: p.model, prompt: p.prompt, duration: p.duration, aspect_ratio: p.aspect, resolution: p.resolution }),
  });
  if (!j.request_id) throw new MediaError('xAI did not return a video request id.', 502);
  return j.request_id;
}

export type VideoPoll = { status: 'pending' } | { status: 'done'; url: string } | { status: 'failed'; reason: string };

export async function pollVideo(requestId: string): Promise<VideoPoll> {
  if (!/^[\w-]{4,128}$/.test(requestId)) throw new MediaError('Bad video request id.', 400);
  const j = await xaiJson<{ status?: string; video?: { url?: string }; error?: unknown }>(`/videos/${requestId}`);
  if (j.status === 'done') {
    if (!j.video?.url) return { status: 'failed', reason: 'finished without a video URL' };
    return { status: 'done', url: j.video.url };
  }
  if (j.status === 'failed' || j.status === 'expired') {
    return { status: 'failed', reason: maskSecrets(typeof j.error === 'string' ? j.error : j.status) };
  }
  return { status: 'pending' };
}

/** Stream a finished video to `file` (xAI serves temporary public URLs; our key is not sent). */
export async function downloadVideoTo(url: string, file: string): Promise<void> {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new MediaError('Refusing a non-https download URL.', 502);
  const res = await fetch(u, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok || !res.body) throw new MediaError(`Video download failed (${res.status}).`, 502);
  await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), fs.createWriteStream(file));
}
