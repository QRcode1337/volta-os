// Seed data + types for Generations and VOLTA Carousels (Sub-Agent 5C).
// Pure module: safe to import from client components AND the /api/media route.

// ───────────────────────── Generations ─────────────────────────

export type MediaModelId = 'flux-ultra' | 'runway-gen4' | 'kling-21' | 'ideogram-3' | 'recraft-v3';
export type AspectId = '16:9' | '4:5' | '9:16';
export type GenVariant = 'standard' | 'wildcard';
export type GenMediaType = 'thumbnail' | 'animation';

export interface MediaModelSpec {
  id: MediaModelId;
  label: string;
  vendor: string;
  kind: 'image' | 'video';
  costPerItem: number; // USD
  clipSec?: number; // video models only
}

export const MEDIA_MODELS: MediaModelSpec[] = [
  { id: 'flux-ultra', label: 'Flux 1.1 Pro Ultra', vendor: 'Black Forest Labs', kind: 'image', costPerItem: 0.06 },
  { id: 'runway-gen4', label: 'Runway Gen-4 Turbo', vendor: 'Runway', kind: 'video', costPerItem: 0.25, clipSec: 5 },
  { id: 'kling-21', label: 'Kling 2.1', vendor: 'Kuaishou', kind: 'video', costPerItem: 0.28, clipSec: 5 },
  { id: 'ideogram-3', label: 'Ideogram 3.0', vendor: 'Ideogram', kind: 'image', costPerItem: 0.08 },
  { id: 'recraft-v3', label: 'Recraft V3', vendor: 'Recraft', kind: 'image', costPerItem: 0.04 },
];

export const MODEL_BY_ID: Record<MediaModelId, MediaModelSpec> = Object.fromEntries(
  MEDIA_MODELS.map((m) => [m.id, m]),
) as Record<MediaModelId, MediaModelSpec>;

export interface AspectSpec {
  id: AspectId;
  label: string;
  w: number;
  h: number;
}

export const ASPECTS: AspectSpec[] = [
  { id: '16:9', label: '16:9 Thumbnail', w: 16, h: 9 },
  { id: '4:5', label: '4:5 Carousel', w: 4, h: 5 },
  { id: '9:16', label: '9:16 Reel', w: 9, h: 16 },
];

export const ASPECT_BY_ID: Record<AspectId, AspectSpec> = Object.fromEntries(ASPECTS.map((a) => [a.id, a])) as Record<
  AspectId,
  AspectSpec
>;

export interface GenItem {
  id: string;
  batchId: string;
  prompt: string;
  model: MediaModelId;
  aspect: AspectId;
  seed: number;
  variant: GenVariant;
  mediaType: GenMediaType;
  cost: number;
  createdAt: string; // ISO
  promoted?: boolean;
  sentToEditor?: boolean;
}

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'is', 'are', 'that', 'this',
  'my', 'your', 'how', 'why', 'what', 'thumbnail', 'youtube', 'video', 'style', 'shot', 'image', 'render', 'showing',
  'bold', 'dark', 'orange', 'robo', 'brand', 'animation', 'animated', 'loop', 'reel', 'carousel', 'cinematic',
]);

/** Prompt → short uppercase thumbnail headline (2–4 words). Quoted text wins. */
export function headlineFromPrompt(prompt: string): string {
  const quoted = prompt.match(/["“]([^"”]{3,40})["”]/);
  if (quoted) return quoted[1].toUpperCase();
  const words = prompt
    .replace(/[^\p{L}\p{N}\s.%$#+-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w.toLowerCase()));
  const pick = words.slice(0, words.length > 5 ? 4 : 3);
  return (pick.length ? pick.join(' ') : 'UNTITLED').toUpperCase();
}

// ───────────────────────── Carousels ─────────────────────────

export type SlideKind = 'cover' | 'point' | 'stat' | 'cta';
export type SlideTheme = 'dark' | 'paper';

export interface Slide {
  id: string;
  kind: SlideKind;
  theme: SlideTheme;
  kicker: string;
  headline: string;
  body: string;
  /** Big Doto numeral for `stat` slides ("41%", "$0.18"). */
  stat?: string;
}

export interface Deck {
  id: string;
  /** The short's number in its Notion page (S01 -> 1); the card shows it as "S01". */
  postNumber: number;
  title: string;
  platform: 'YOUTUBE SHORTS' | 'TIKTOK' | 'INSTAGRAM' | 'LINKEDIN';
  handle: string;
  slides: Slide[];
  /** Everything below comes straight from the Notion page. */
  hook: string;
  episode: string | null;
  source: string | null;
  /** Full voiceover, when the page has one. */
  voiceover: string | null;
  /** On-screen card text lines ("CARDS" field). */
  cards: string[];
  caption: string | null;
  /** 1-based position in the page's suggested posting order, when it lists one. */
  queue: number | null;
  /** Marked "(bench)" in Notion: written but not in the first posting batch. */
  bench: boolean;
  notionUrl: string;
  pageTitle: string;
}
