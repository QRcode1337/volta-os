// Shot-list router: parse a pasted shot list / script into shots and route each one through the video hierarchy.
// Pure (client + server). Prices and model availability come from the live MediaStatus, never from here.

import type { MediaStatus, ShotItem, VideoModelInfo } from '@/types/media';

export type TierId = 0 | 1 | 2 | 3 | 4;

export interface TierSpec {
  id: TierId;
  name: string;
  use: string;
  /** Model the API generates this tier with (tier 4's is only the fallback; Flow by hand is the default). */
  model: string;
  resolution: string;
  /** Default seconds when the shot gives no "(6s)" hint. */
  seconds: number;
  /** Hand off to Google Flow by hand (subscription credits) by default; `model` is only the paid API fallback. */
  flow?: boolean;
  /** Extra Flow prompt direction for this tier. */
  flowStyle?: string;
}

/**
 * The hierarchy. Every shot gets a cheap API draft at tier 0; everything above that is made in Google Flow by hand
 * from a copy-ready prompt (Flow quality beats the APIs). Each tier keeps an API model as an explicit paid fallback.
 * Two misses at a tier = move up one tier instead of regenerating again.
 */
export const TIERS: Record<TierId, TierSpec> = {
  0: { id: 0, name: 'Draft', use: 'framing, timing and motion tests (API)', model: 'grok-imagine-video-1.5-lite', resolution: '480p', seconds: 5 },
  1: {
    id: 1, name: 'B-roll', use: 'atmosphere, skies, archive-style filler, cutaways', model: 'grok-imagine-video-1.5-lite', resolution: '720p', seconds: 6, flow: true,
    flowStyle: 'Purpose: b-roll / cutaway. Slow, steady camera; no people in frame unless described.',
  },
  2: {
    id: 2, name: 'Story', use: 'people, consistent subjects, dialogue or voice', model: 'grok-imagine-video-1.5', resolution: '720p', seconds: 6, flow: true,
    flowStyle: 'Purpose: story shot with people. Keep faces, wardrobe and setting consistent with neighbouring shots; natural performances; any spoken line in quotes is delivered on camera.',
  },
  3: {
    id: 3, name: 'Finish', use: 'polish / refine a shot you already like', model: 'gemini-omni-1.1-flash', resolution: '720p', seconds: 10, flow: true,
    flowStyle: 'Purpose: final version of an approved draft. Match its framing and motion; raise detail, lighting and realism.',
  },
  4: {
    id: 4, name: 'Hero', use: 'trailer moments, openers, thumbnails', model: 'gemini-omni-1.1-flash', resolution: '720p', seconds: 10, flow: true,
    flowStyle: 'Purpose: hero shot (trailer / opener / thumbnail). Striking composition, deliberate camera move, strong silhouette and contrast.',
  },
};
export const TIER_IDS: TierId[] = [0, 1, 2, 3, 4];

export interface Shot {
  /** Stable across reloads: hash of the normalized text plus its position. */
  id: string;
  n: number;
  text: string;
  /** Tier the shot is headed for (auto-classified; the user can override). */
  target: TierId;
  reason: string;
  /** Seconds hinted in the text, e.g. "(6s)", clamped 1-15. */
  seconds?: number;
}

const HERO = /\b(hero|opening|open on|cold open|trailer|title card|thumbnail|money shot|key (?:moment|shot)|climax|final reveal|big reveal)\b/i;
const FINISH = /\b(extend|continue|continuation|upscale|polish|refine|final version|re-?do)\b/i;
const STORY =
  /\b(says?|said|speaks?|speaking|dialogue|voice ?over|narrat\w*|interview\w*|witness\w*|pilot|man|woman|men|women|person|people|character|face|close-?up|hands?|crowd|soldiers?|officers?|scientists?|reporter|lip)\b|["“][^"”]{3,}["”]/i;
const SECONDS = /\(?\b(\d{1,2})\s*(?:s|sec|secs|seconds)\b\)?/i;

function classify(text: string): { target: TierId; reason: string } {
  const m = (re: RegExp) => re.exec(text)?.[0];
  let hit: string | undefined;
  if ((hit = m(HERO))) return { target: 4, reason: `hero: "${hit}"` };
  if ((hit = m(FINISH))) return { target: 3, reason: `finish: "${hit}"` };
  if ((hit = m(STORY))) return { target: 2, reason: `people / voice: "${hit.slice(0, 24)}"` };
  return { target: 1, reason: 'no people or hero cues: b-roll' };
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export const MAX_SHOTS = 40;

/** One shot per numbered / bulleted line, or per blank-line-separated block when the list uses paragraphs. */
export function parseShots(input: string): Shot[] {
  const text = input.replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  const blocks = /\n\s*\n/.test(text) ? text.split(/\n\s*\n/) : text.split('\n');
  const shots: Shot[] = [];
  for (const raw of blocks) {
    const clean = raw
      .replace(/^\s*(?:shot|scene)?\s*#?\d+\s*[.):\-–—]?\s*/i, '')
      .replace(/^\s*[-*•]\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean.length < 3) continue;
    const n = shots.length + 1;
    const secs = SECONDS.exec(clean);
    const { target, reason } = classify(clean);
    shots.push({
      id: `s${n}-${hash(clean.toLowerCase())}`,
      n,
      text: clean,
      target,
      reason,
      seconds: secs ? Math.min(15, Math.max(1, Number(secs[1]))) : undefined,
    });
    if (shots.length >= MAX_SHOTS) break;
  }
  return shots;
}

/** All video models the status reports (xAI + Gemini Omni). */
export function availableVideoModels(status: MediaStatus | null): VideoModelInfo[] {
  if (!status) return [];
  return [...(status.xai.configured ? status.xai.videoModels : []), ...(status.gemini.configured ? status.gemini.videoModels : [])];
}

export interface ShotPlan {
  item: ShotItem | null;
  /** Estimate in USD (Omni at its 10 s maximum); null when the tier's model isn't available. */
  estUsd: number | null;
  unavailable?: string;
}

/** The API request for one shot at one tier (tier 4 → the Omni fallback; Flow is the manual path). */
export function planShot(shot: Shot, tier: TierId, models: VideoModelInfo[], aspect: string): ShotPlan {
  const spec = TIERS[tier];
  const m = models.find((x) => x.id === spec.model);
  if (!m) return { item: null, estUsd: null, unavailable: `${spec.model} isn't available (check the API key)` };
  if (m.aspects && !m.aspects.includes(aspect)) return { item: null, estUsd: null, unavailable: `${m.id} only supports ${m.aspects.join(' / ')}` };
  const resolution = m.resolutions.includes(spec.resolution) ? spec.resolution : m.resolutions[0];
  const duration = m.maxAutoSeconds ?? shot.seconds ?? spec.seconds;
  const perSec = m.perSecondUsd[resolution] ?? 0;
  return {
    item: { shotId: shot.id, tier, model: m.id, prompt: shotPrompt(shot.text, aspect), resolution, duration },
    estUsd: perSec * (m.maxAutoSeconds ?? duration),
  };
}

/** The prompt sent to the APIs: the shot text plus framing that keeps a documentary look consistent. */
export function shotPrompt(text: string, aspect: string): string {
  const frame = aspect === '9:16' ? 'vertical 9:16 framing' : 'widescreen 16:9 framing';
  return `${text.replace(SECONDS, '').trim()} Cinematic documentary footage, ${frame}, natural motion, no on-screen text or captions.`;
}

/** Ready-to-paste prompt for Google Flow (every tier above the draft is made there by hand on subscription credits). */
export function flowPrompt(shot: Shot, aspect: string, tier: TierId = shot.target): string {
  const secs = shot.seconds ?? 8;
  return [
    shotPrompt(shot.text, aspect),
    `Length: about ${secs} seconds.`,
    TIERS[tier].flowStyle,
    'Style: grounded, filmic, shallow depth of field, subtle film grain, motivated lighting. Avoid text, logos and watermarks.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Numbered Flow prompts for several shots, one block each (for pasting into Flow shot by shot). */
export function flowPrompts(shots: { shot: Shot; tier: TierId }[], aspect: string): string {
  return shots.map(({ shot, tier }) => `#${shot.n} · T${tier} ${TIERS[tier].name}\n${flowPrompt(shot, aspect, tier)}`).join('\n\n---\n\n');
}
