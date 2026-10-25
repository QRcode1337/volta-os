'use client';
// Browser-side helpers for VOLTA Music: fetch wrappers and Web Audio waveform peaks.
import { trackStreamUrl } from './format';

export async function api<T>(url: string, opts: { method?: 'GET' | 'PUT' | 'POST'; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: 'no-store',
    signal: opts.signal,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

// ───────────────────────── waveform ─────────────────────────

/** Decoding a whole file costs ~10x its size in float samples; skip very large ones (the bar shows a flat line instead). */
const MAX_DECODE_BYTES = 160 * 1024 * 1024;
const PEAK_COUNT = 900;
const peakCache = new Map<string, Float32Array>();
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

export class WaveformSkipped extends Error {}

/** Fetches the streamed file and reduces it to PEAK_COUNT normalised peaks with Web Audio. Throws WaveformSkipped when too big. */
export async function loadPeaks(id: string, bytes: number, signal: AbortSignal): Promise<Float32Array> {
  const hit = peakCache.get(id);
  if (hit) return hit;
  if (bytes > MAX_DECODE_BYTES) throw new WaveformSkipped('file too large to decode in the browser');
  const res = await fetch(trackStreamUrl(id), { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.arrayBuffer();
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  const buf = await getCtx().decodeAudioData(data);
  const peaks = new Float32Array(PEAK_COUNT);
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const per = buf.length / PEAK_COUNT;
  const stride = Math.max(1, Math.floor(per / 256));
  let max = 0;
  for (let i = 0; i < PEAK_COUNT; i++) {
    const from = Math.floor(i * per);
    const to = Math.min(buf.length, Math.floor((i + 1) * per));
    let p = 0;
    for (const ch of chans) for (let j = from; j < to; j += stride) p = Math.max(p, Math.abs(ch[j]));
    peaks[i] = p;
    if (p > max) max = p;
  }
  if (max > 0) for (let i = 0; i < PEAK_COUNT; i++) peaks[i] /= max;
  if (peakCache.size >= 40) peakCache.delete(peakCache.keys().next().value as string);
  peakCache.set(id, peaks);
  return peaks;
}
