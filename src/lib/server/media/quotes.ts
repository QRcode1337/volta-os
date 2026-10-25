import 'server-only';
import { randomBytes } from 'node:crypto';
import type { GenRequest, ImageRequest, Quote, VideoRequest, VoiceRequest } from '@/types/media';
import { MAX_REQUEST_USD, MediaError, QUOTE_TTL_MS } from './config';
import { elevenUsdPerCredit, round6 } from './pricing';
import { requireStorage, todayDir } from './storage';
import { getQuota, listTtsModels, listVoices } from './elevenlabs';
import { listImageModels, listVideoModels } from './xai';

export const IMAGE_ASPECTS = ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'] as const;
export const VIDEO_ASPECTS = ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3', '21:9'] as const;
export const MAX_IMAGE_COUNT = 8;
export const MAX_VIDEO_COUNT = 3;
export const MAX_VIDEO_SECONDS = 15;

interface StoredQuote {
  quote: Quote;
  req: GenRequest;
  expiresAt: number;
  used: boolean;
  /** Voice only: credits the request consumes (re-checked against the live quota at generate time). */
  credits?: number;
}

interface Registry {
  quotes: Map<string, StoredQuote>;
  recentQuotes: number[];
  recentGenerates: number[];
  inflight: string | null;
}
// globalThis so dev hot reload doesn't drop live quotes / the in-flight lock.
const g = globalThis as unknown as { __voltaMedia?: Registry };
export const registry: Registry = (g.__voltaMedia ??= { quotes: new Map(), recentQuotes: [], recentGenerates: [], inflight: null });

/** Sliding-window limiter. Throws 429 when `max` events already happened within `windowMs`. */
export function rateLimit(events: number[], max: number, windowMs: number, what: string): void {
  const now = Date.now();
  while (events.length && now - events[0] > windowMs) events.shift();
  if (events.length >= max) throw new MediaError(`Too many ${what} requests; wait a few seconds.`, 429);
  events.push(now);
}

function prune() {
  const now = Date.now();
  for (const [id, q] of registry.quotes) if (q.expiresAt < now - 60_000) registry.quotes.delete(id);
}

const str = (v: unknown, max: number, field: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new MediaError(`${field} is required.`, 400);
  if (v.length > max) throw new MediaError(`${field} is too long (max ${max} characters).`, 400);
  return v.trim();
};
const int = (v: unknown, lo: number, hi: number, field: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) throw new MediaError(`${field} must be a whole number from ${lo} to ${hi}.`, 400);
  return v;
};
const unit = (v: unknown, field: string): number => {
  if (typeof v !== 'number' || !(v >= 0 && v <= 1)) throw new MediaError(`${field} must be between 0 and 1.`, 400);
  return Math.round(v * 100) / 100;
};

export async function createQuote(raw: unknown): Promise<Quote> {
  rateLimit(registry.recentQuotes, 30, 60_000, 'quote');
  if (!raw || typeof raw !== 'object') throw new MediaError('Body must be a JSON object.', 400);
  const b = raw as Record<string, unknown>;
  const storage = await requireStorage(); // refuse early: no point quoting what can't be saved

  const warnings: string[] = [];
  let req: GenRequest;
  let estUsd = 0;
  let count = 1;
  let breakdown = '';
  let provider: Quote['provider'];
  let model = '';
  let credits: number | undefined;
  let creditsRemainingAfter: number | undefined;

  if (b.kind === 'image') {
    provider = 'xai';
    const models = await listImageModels();
    const m = models.find((x) => x.id === b.model);
    if (!m) throw new MediaError(`Unknown image model "${String(b.model)}". Available: ${models.map((x) => x.id).join(', ') || 'none'}.`, 400);
    const r: ImageRequest = {
      kind: 'image',
      model: m.id,
      prompt: str(b.prompt, m.maxPromptLength, 'Prompt'),
      aspect: IMAGE_ASPECTS.includes(b.aspect as never) ? (b.aspect as string) : 'auto',
      count: int(b.count, 1, MAX_IMAGE_COUNT, 'Count'),
    };
    let unitUsd = m.priceUsd;
    if (m.tiers) {
      if (typeof b.quality === 'string' || typeof b.resolution === 'string') {
        const tier = m.tiers.find((t) => t.quality === b.quality && t.resolution === b.resolution);
        if (!tier) throw new MediaError(`No "${String(b.quality)}" / "${String(b.resolution)}" price tier for ${m.id}.`, 400);
        r.quality = tier.quality as ImageRequest['quality'];
        r.resolution = tier.resolution;
        unitUsd = tier.priceUsd;
      } else {
        warnings.push(`${m.id} has price tiers; using the default (${m.priceUsd.toFixed(2)} per image).`);
      }
    }
    req = r;
    model = m.id;
    count = r.count;
    estUsd = unitUsd * count;
    breakdown = `${count} image${count > 1 ? 's' : ''} x $${unitUsd.toFixed(3)}${r.quality ? ` (${r.quality}, ${r.resolution})` : ''}`;
  } else if (b.kind === 'video') {
    provider = 'xai';
    const models = await listVideoModels();
    const m = models.find((x) => x.id === b.model);
    if (!m) throw new MediaError(`Unknown video model "${String(b.model)}". Available: ${models.map((x) => x.id).join(', ') || 'none'}.`, 400);
    const resolution = typeof b.resolution === 'string' && m.resolutions.includes(b.resolution) ? b.resolution : null;
    if (!resolution) throw new MediaError(`Resolution must be one of ${m.resolutions.join(', ')} for ${m.id}.`, 400);
    const r: VideoRequest = {
      kind: 'video',
      model: m.id,
      prompt: str(b.prompt, 4000, 'Prompt'),
      aspect: VIDEO_ASPECTS.includes(b.aspect as never) ? (b.aspect as string) : '16:9',
      count: int(b.count, 1, MAX_VIDEO_COUNT, 'Count'),
      duration: int(b.duration, 1, MAX_VIDEO_SECONDS, 'Duration'),
      resolution,
    };
    req = r;
    model = m.id;
    count = r.count;
    const perSec = m.perSecondUsd[resolution];
    estUsd = perSec * r.duration * count;
    breakdown = `${count} clip${count > 1 ? 's' : ''} x ${r.duration}s x $${perSec.toFixed(2)}/s (${resolution})`;
  } else if (b.kind === 'voice') {
    provider = 'elevenlabs';
    const [models, voices, quota] = await Promise.all([listTtsModels(), listVoices(), getQuota()]);
    const m = models.find((x) => x.id === b.model);
    if (!m) throw new MediaError(`Unknown voice model "${String(b.model)}".`, 400);
    const voice = voices.find((v) => v.id === b.voiceId);
    if (!voice) throw new MediaError('Unknown voice.', 400);
    const text = str(b.text, m.maxChars, 'Text');
    let stability = unit(b.stability, 'Stability');
    if (m.id.startsWith('eleven_v3')) {
      const snapped = [0, 0.5, 1].reduce((a, c) => (Math.abs(c - stability) < Math.abs(a - stability) ? c : a));
      if (snapped !== stability) warnings.push(`${m.name} only supports stability 0 / 0.5 / 1; using ${snapped}.`);
      stability = snapped;
    }
    const r: VoiceRequest = { kind: 'voice', model: m.id, voiceId: voice.id, text, stability, similarity: unit(b.similarity, 'Similarity') };
    credits = Math.ceil(text.length * m.creditMultiplier);
    if (credits > quota.remaining) {
      throw new MediaError(`Needs ${credits.toLocaleString()} credits but only ${quota.remaining.toLocaleString()} remain this period.`, 422);
    }
    creditsRemainingAfter = quota.remaining - credits;
    req = r;
    model = m.id;
    estUsd = credits * elevenUsdPerCredit(quota.tier);
    breakdown = `${text.length.toLocaleString()} chars x ${m.creditMultiplier} = ${credits.toLocaleString()} credits of ${quota.remaining.toLocaleString()} left (${quota.tier} plan${estUsd === 0 ? ', no overage' : ''})`;
  } else {
    throw new MediaError('kind must be image, video or voice.', 400);
  }

  estUsd = round6(estUsd);
  if (estUsd > MAX_REQUEST_USD) {
    throw new MediaError(`Estimated $${estUsd.toFixed(2)} is over the $${MAX_REQUEST_USD} per-request safety cap. Reduce count, duration or resolution.`, 422);
  }
  if (storage.freeBytes < 4 * 1024 ** 3) warnings.push(`Windsor has ${(storage.freeBytes / 1024 ** 3).toFixed(1)} GiB free.`);

  prune();
  const quoteId = `q_${randomBytes(12).toString('hex')}`;
  const expiresAt = Date.now() + QUOTE_TTL_MS;
  const quote: Quote = {
    quoteId,
    expiresAt: new Date(expiresAt).toISOString(),
    kind: req.kind,
    provider,
    model,
    count,
    estUsd,
    breakdown,
    outputDir: todayDir(),
    credits,
    creditsRemainingAfter,
    warnings,
  };
  registry.quotes.set(quoteId, { quote, req, expiresAt, used: false, credits });
  return quote;
}
