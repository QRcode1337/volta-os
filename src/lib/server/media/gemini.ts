import 'server-only';
import { HttpError } from '../http-error';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { VideoModelInfo } from '@/types/media';
import { geminiKey, maskSecrets } from './config';
import { OMNI_ASPECTS, OMNI_MAX_SECONDS, OMNI_MODEL, OMNI_PRICES } from './pricing';

// Gemini Omni Flash video via the Interactions API (ai.google.dev/gemini-api/docs/omni). One POST returns the
// finished clip; with delivery "uri" the clip is a Files API file we poll until ACTIVE, then download.

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** Omni renders synchronously inside the POST; give it room before calling it a timeout. */
const GENERATE_TIMEOUT_MS = 12 * 60_000;
const FILE_POLL_MS = 3_000;
const FILE_MAX_MS = 5 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Omni is offered whenever a Gemini key is set; price/limits come from pricing.ts (no live catalog for video). */
export function listOmniModels(): VideoModelInfo[] {
  if (!geminiKey()) return [];
  return [
    {
      id: OMNI_MODEL,
      perSecondUsd: OMNI_PRICES,
      resolutions: Object.keys(OMNI_PRICES),
      provider: 'gemini',
      aspects: [...OMNI_ASPECTS],
      maxAutoSeconds: OMNI_MAX_SECONDS,
    },
  ];
}

function key(): string {
  const k = geminiKey();
  if (!k) throw new HttpError('Add GEMINI_API_KEY to ~/Volta-OS/.env.local (then restart VOLTA OS).', 412);
  return k;
}

async function gemini(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  return fetch(path.startsWith('https://') ? path : `${BASE}${path}`, {
    ...init,
    headers: { 'x-goog-api-key': key(), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
}

async function geminiJson<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const res = await gemini(path, init, timeoutMs);
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text) as { error?: { message?: unknown; status?: unknown } | string };
      detail = typeof j.error === 'string' ? j.error : typeof j.error?.message === 'string' ? j.error.message : text;
    } catch {
      // keep raw text
    }
    throw new HttpError(`Gemini ${res.status}: ${maskSecrets(detail).slice(0, 400)}`, res.status === 401 || res.status === 403 || res.status >= 500 ? 502 : 422);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError('Gemini returned a non-JSON response.', 502);
  }
}

interface VideoPart {
  type?: string;
  mime_type?: string;
  data?: string;
  uri?: string;
}
interface Interaction {
  id?: string;
  status?: string;
  steps?: { type?: string; content?: VideoPart[] }[];
  error?: { message?: string };
}

/** Generate one Omni clip and write it to `file`. Returns the interaction id (lets a later edit/extend build on it). */
export async function generateOmniVideoTo(p: { prompt: string; aspect: string; resolution: string }, file: string): Promise<string> {
  const j = await geminiJson<Interaction>(
    '/interactions',
    {
      method: 'POST',
      body: JSON.stringify({
        model: OMNI_MODEL,
        input: p.prompt,
        response_format: { type: 'video', aspect_ratio: p.aspect, resolution: p.resolution, delivery: 'uri' },
      }),
    },
    GENERATE_TIMEOUT_MS,
  );
  if (j.status && j.status !== 'completed') {
    throw new HttpError(`Gemini Omni ${j.status}${j.error?.message ? `: ${maskSecrets(j.error.message).slice(0, 300)}` : ''}`, 502);
  }
  const video = (j.steps ?? []).flatMap((s) => (s.type === 'model_output' ? (s.content ?? []) : [])).find((c) => c.type === 'video');
  if (!video) throw new HttpError('Gemini Omni finished without a video (likely blocked by its safety filters; rephrase the shot).', 502);
  if (video.data) {
    await fs.promises.writeFile(file, Buffer.from(video.data, 'base64'));
  } else if (video.uri) {
    await downloadFileTo(video.uri, file);
  } else {
    throw new HttpError('Gemini Omni returned a video part with neither data nor uri.', 502);
  }
  return j.id ?? '';
}

/** Files API delivery: wait for the file to be ACTIVE, then stream `:download?alt=media` (needs the key). */
async function downloadFileTo(uri: string, file: string): Promise<void> {
  const u = new URL(uri);
  if (u.protocol !== 'https:' || u.hostname !== 'generativelanguage.googleapis.com') throw new HttpError('Refusing an unexpected Gemini download URL.', 502);
  const id = /\/files\/([\w-]+)/.exec(u.pathname)?.[1];
  if (id) {
    const started = Date.now();
    for (;;) {
      const f = await geminiJson<{ state?: string; error?: { message?: string } }>(`/files/${id}`, { method: 'GET' }, 30_000);
      if (!f.state || f.state === 'ACTIVE') break;
      if (f.state === 'FAILED') throw new HttpError(`Gemini file ${id} failed: ${maskSecrets(f.error?.message ?? 'no reason')}`, 502);
      if (Date.now() - started > FILE_MAX_MS) throw new HttpError(`Gemini file ${id} still processing after 5 min.`, 504);
      await sleep(FILE_POLL_MS);
    }
  }
  const res = await gemini(u.toString(), { method: 'GET', redirect: 'follow' }, 300_000);
  if (!res.ok || !res.body) throw new HttpError(`Gemini video download failed (${res.status}).`, 502);
  await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), fs.createWriteStream(file));
}
