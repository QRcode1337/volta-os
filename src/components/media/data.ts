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

export const BATCH_SIZES = [1, 2, 4, 5, 8, 10] as const;

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

/** Exactly round(20%) of a batch when the wildcard toggle is on. */
export function wildcardCount(batch: number, enabled: boolean): number {
  return enabled ? Math.round(batch * 0.2) : 0;
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

/** Cheap deterministic 32-bit hash for strings. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type SeedRow = [string, MediaModelId, AspectId, number, GenVariant, string];

// prompt, model, aspect, seed, variant, createdAt
const SEED_ROWS: SeedRow[] = [
  ['"Claude 5.5 Changed Everything" — creator pointing at glowing terminal', 'flux-ultra', '16:9', 48213, 'standard', '2026-10-22T18:40:00Z'],
  ['"I Replaced My Team" robot head HUD split screen', 'ideogram-3', '16:9', 77104, 'standard', '2026-10-22T18:40:00Z'],
  ['"Agentic OS" orbital ring of artifacts, orange core', 'runway-gen4', '16:9', 31337, 'standard', '2026-10-22T16:05:00Z'],
  ['"Wildcard 80/20" risograph poster of two overlapping minds', 'recraft-v3', '4:5', 90210, 'wildcard', '2026-10-22T16:05:00Z'],
  ['"Prompt Cache Math" cold vs warm meter, dollars burning', 'flux-ultra', '16:9', 12045, 'standard', '2026-10-21T21:12:00Z'],
  ['"MCP Bloat" context window filling with heavy blocks', 'kling-21', '9:16', 66012, 'standard', '2026-10-21T21:12:00Z'],
  ['"ARMS Framework" stacked layers apps routines memory skills', 'ideogram-3', '4:5', 23999, 'standard', '2026-10-21T14:30:00Z'],
  ['"Second Brain" 424k files vaporwave sunset grid', 'flux-ultra', '16:9', 51824, 'wildcard', '2026-10-21T14:30:00Z'],
  ['"Jev Routing" 41% to Haiku, router switchboard', 'runway-gen4', '16:9', 40411, 'wildcard', '2026-10-20T19:48:00Z'],
  ['"Skills Beat Prompts" chart arrow up, bold numerals', 'recraft-v3', '16:9', 87001, 'standard', '2026-10-20T19:48:00Z'],
  ['"Build In Public" swiss poster grid, red numerals', 'ideogram-3', '4:5', 15562, 'wildcard', '2026-10-20T11:02:00Z'],
  ['"$0.18 For 4,451 Calls" receipt close-up with orange glow', 'flux-ultra', '9:16', 70707, 'standard', '2026-10-19T22:16:00Z'],
  ['"Delete Your MCPs" acid y2k chrome warning sign', 'kling-21', '9:16', 34343, 'wildcard', '2026-10-19T22:16:00Z'],
  ['"One Local OS" mascot hero shot with terminal window', 'recraft-v3', '16:9', 99881, 'standard', '2026-10-18T17:55:00Z'],
  ['"Routines Run While I Sleep" bauhaus clock shapes', 'flux-ultra', '16:9', 28871, 'wildcard', '2026-10-18T17:55:00Z'],
  ['"Opus vs Haiku" side-by-side model duel, versus lockup', 'runway-gen4', '4:5', 61616, 'standard', '2026-10-18T09:20:00Z'],
];

export const SEED_GEN_ITEMS: GenItem[] = SEED_ROWS.map(([prompt, model, aspect, seed, variant, createdAt], i) => {
  const spec = MODEL_BY_ID[model];
  return {
    id: `seed-${String(i + 1).padStart(2, '0')}`,
    batchId: `seed-batch-${createdAt.slice(0, 13)}`,
    prompt,
    model,
    aspect,
    seed,
    variant,
    mediaType: spec.kind === 'video' ? 'animation' : 'thumbnail',
    cost: spec.costPerItem,
    createdAt,
  };
});

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
  postNumber: number;
  title: string;
  platform: 'INSTAGRAM' | 'LINKEDIN';
  handle: string;
  slides: Slide[];
}

const s = (id: string, kind: SlideKind, theme: SlideTheme, kicker: string, headline: string, body: string, stat?: string): Slide => ({
  id,
  kind,
  theme,
  kicker,
  headline,
  body,
  stat,
});

export const DECKS: Deck[] = [
  {
    id: 'post-14',
    postNumber: 14,
    title: 'The ARMS Framework in 7 Slides',
    platform: 'INSTAGRAM',
    handle: '@robonuggets',
    slides: [
      s('p14-1', 'cover', 'dark', 'POST #14 · AGENTIC OS', 'The ARMS Framework', 'How I run an entire content business out of one folder of plain-text files that Claude can route.'),
      s('p14-2', 'point', 'dark', 'THE PROBLEM', 'Prompts don’t compound.', 'Every chat starts from zero. You re-explain your brand, your tone, your tools. That context tax is paid on every single session.'),
      s('p14-3', 'point', 'paper', 'A — APPS', 'Apps are the hands.', 'CLIs first, APIs second, MCPs last. Each connector gets a one-line note in applications/ so Claude knows the lightest tool for the job.'),
      s('p14-4', 'point', 'dark', 'R — ROUTINES', 'Routines run while you sleep.', 'Inbox triage at 7am, brand-watch at noon, weekly recos on Sunday. Each routine is a markdown file with a schedule, a model and an output path.'),
      s('p14-5', 'point', 'paper', 'M — MEMORY', 'Memory is an index, not a dump.', 'CLAUDE.md routes to department files. MEMORY.md holds one-line pointers. Claude reads 2k tokens to find what it needs instead of 200k.'),
      s('p14-6', 'stat', 'dark', 'S — SKILLS', 'Skills are taste, written down.', 'Database skills like /thumb and /tone learn from every approved asset — with a 20% wildcard quota so they never overfit.', '80/20'),
      s('p14-7', 'cta', 'dark', 'STEAL THIS', 'Apps. Routines. Memory. Skills.', 'Save this post, then create four folders tonight. Comment “ARMS” and I’ll send you my starter CLAUDE.md.'),
    ],
  },
  {
    id: 'post-15',
    postNumber: 15,
    title: 'Why MCPs Drain Your Context Window',
    platform: 'INSTAGRAM',
    handle: '@robonuggets',
    slides: [
      s('p15-1', 'cover', 'dark', 'POST #15 · CONTEXT', 'Your MCPs are eating your context.', 'Before you type a single word, your agent has already spent tens of thousands of tokens describing tools it won’t use.'),
      s('p15-2', 'stat', 'dark', 'THE TAX', 'Preloaded before “hello”.', 'Calendar 9.8k + Gmail 12.4k + Slack 18.6k tool-schema tokens load into every session, whether you use them or not.', '40.8k'),
      s('p15-3', 'point', 'paper', 'WHY IT HURTS', 'Bloat breaks the cache.', 'A heavier system prompt means more tokens to re-warm after every idle gap. Cold reloads on Opus cost real money — every morning.'),
      s('p15-4', 'stat', 'dark', 'USAGE CHECK', 'Slack MCP: used 3× a week.', '18.6k tokens of tool definitions per chat for three calls a week. That’s the worst ratio in the whole stack.', '3×'),
      s('p15-5', 'point', 'paper', 'THE LADDER', 'CLI → API → MCP.', 'Reach for a CLI first (zero schema cost), a thin API script second, and only keep an MCP when you truly need live, bidirectional tools.'),
      s('p15-6', 'cta', 'dark', 'DO THIS TODAY', 'Audit. Disable. Measure.', 'List every MCP, its token weight and weekly uses. Disable anything under 5 uses/wk. Watch your warm-cache window stretch.'),
    ],
  },
  {
    id: 'post-16',
    postNumber: 16,
    title: 'Jev Routing Math',
    platform: 'LINKEDIN',
    handle: 'Jay E · RoboNuggets',
    slides: [
      s('p16-1', 'cover', 'dark', 'POST #16 · ROUTING', 'Stop sending everything to Opus.', 'A tiny classifier in front of your agent decides which model each job deserves. Here’s the math on 4,451 real calls.'),
      s('p16-2', 'stat', 'dark', 'MEET JEV', 'Six milliseconds per decision.', 'Jev reads the prompt and the skill, then routes to HAIKU, SONNET or OPUS. Each classification costs $0.00004.', '0.006s'),
      s('p16-3', 'stat', 'paper', 'THE SPLIT', '41% of calls never needed a big model.', 'Formatting, triage, summaries, file lookups — Haiku handles them at a fraction of the cost with no visible quality drop.', '41%'),
      s('p16-4', 'stat', 'dark', 'ROUTER OVERHEAD', '4,451 routes. $0.18 total.', 'The router pays for itself on the first misrouted Opus call it prevents. Everything after that is pure savings.', '$0.18'),
      s('p16-5', 'point', 'paper', 'WHERE OPUS EARNS IT', 'Keep Opus for taste and depth.', 'Brand design, proposals, long-form scripts and multi-file refactors stay on Opus at HIGH effort. Routing is about fit, not cheapness.'),
      s('p16-6', 'cta', 'dark', 'YOUR MOVE', 'Log first. Route second.', 'Tag a week of calls with model + outcome. The routing rules write themselves. DM “JEV” for my classifier prompt.'),
    ],
  },
];

export const DECK_BY_ID: Record<string, Deck> = Object.fromEntries(DECKS.map((d) => [d.id, d]));
