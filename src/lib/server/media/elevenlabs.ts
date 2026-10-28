import 'server-only';
import { redactSecrets } from '../redact';
import { HttpError } from '../http-error';
import type { ElevenQuota, VoiceInfo, VoiceModelInfo } from '@/types/media';
import { elevenKey } from './config';

const BASE = 'https://api.elevenlabs.io/v1';
const CATALOG_TTL_MS = 10 * 60 * 1000;

async function eleven(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  const key = elevenKey();
  if (!key) throw new HttpError('Add ELEVENLABS_API_KEY to ~/Volta-OS/.env.local (then restart VOLTA OS).', 412);
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'xi-api-key': key, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
}

async function failFrom(res: Response): Promise<never> {
  const text = await res.text();
  let detail = text;
  try {
    const j = JSON.parse(text) as { detail?: unknown };
    const d = j.detail as { message?: string; status?: string } | string | undefined;
    detail = typeof d === 'string' ? d : (d?.message ?? d?.status ?? text);
  } catch {
    // raw text
  }
  throw new HttpError(`ElevenLabs ${res.status}: ${redactSecrets(String(detail)).slice(0, 400)}`, res.status >= 500 || res.status === 401 ? 502 : 422);
}

async function elevenJson<T>(path: string): Promise<T> {
  const res = await eleven(path);
  if (!res.ok) await failFrom(res);
  return (await res.json()) as T;
}

let voiceCache: { at: number; v: VoiceInfo[] } | null = null;
let modelCache: { at: number; v: VoiceModelInfo[] } | null = null;

export async function listVoices(): Promise<VoiceInfo[]> {
  if (voiceCache && Date.now() - voiceCache.at < CATALOG_TTL_MS) return voiceCache.v;
  const j = await elevenJson<{ voices?: { voice_id: string; name: string; category?: string; description?: string; preview_url?: string }[] }>('/voices');
  const v = (j.voices ?? []).map<VoiceInfo>((x) => ({
    id: x.voice_id,
    name: x.name,
    category: x.category ?? 'voice',
    description: x.description || undefined,
    previewUrl: x.preview_url || undefined,
  }));
  voiceCache = { at: Date.now(), v };
  return v;
}

export async function listTtsModels(): Promise<VoiceModelInfo[]> {
  if (modelCache && Date.now() - modelCache.at < CATALOG_TTL_MS) return modelCache.v;
  const j = await elevenJson<
    { model_id: string; name: string; can_do_text_to_speech?: boolean; maximum_text_length_per_request?: number; model_rates?: { character_cost_multiplier?: number } }[]
  >('/models');
  const v = j
    .filter((m) => m.can_do_text_to_speech)
    .map<VoiceModelInfo>((m) => ({
      id: m.model_id,
      name: m.name,
      creditMultiplier: m.model_rates?.character_cost_multiplier ?? 1,
      maxChars: m.maximum_text_length_per_request ?? 5000,
    }));
  modelCache = { at: Date.now(), v };
  return v;
}

/** Always live: quota changes with every request. */
export async function getQuota(): Promise<ElevenQuota> {
  const j = await elevenJson<{ tier?: string; character_count?: number; character_limit?: number; next_character_count_reset_unix?: number | null }>('/user/subscription');
  const used = j.character_count ?? 0;
  const limit = j.character_limit ?? 0;
  return {
    tier: j.tier ?? 'unknown',
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetsAt: j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString() : null,
  };
}

export async function synthesize(p: {
  voiceId: string;
  model: string;
  text: string;
  stability: number;
  similarity: number;
}): Promise<Buffer> {
  if (!/^[A-Za-z0-9]{8,40}$/.test(p.voiceId)) throw new HttpError('Bad voice id.', 400);
  const res = await eleven(
    `/text-to-speech/${p.voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: p.text, model_id: p.model, voice_settings: { stability: p.stability, similarity_boost: p.similarity } }),
    },
    120_000,
  );
  if (!res.ok) await failFrom(res);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new HttpError('ElevenLabs returned an empty audio file.', 502);
  return buf;
}
