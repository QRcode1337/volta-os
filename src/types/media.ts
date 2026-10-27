// Shared (client + server) shapes for the Generations app: real xAI / ElevenLabs generation.

export type MediaKind = 'image' | 'video' | 'voice';
export type MediaProvider = 'xai' | 'elevenlabs' | 'gemini';

/** Validated request body for POST /api/media/quote. */
export type GenRequest = ImageRequest | VideoRequest | VoiceRequest | ShotBatchRequest;

export interface ImageRequest {
  kind: 'image';
  model: string;
  prompt: string;
  aspect: string;
  count: number;
  /** grok-imagine-image-2.0 only: price tier. */
  quality?: 'low' | 'medium';
  resolution?: string;
}
export interface VideoRequest {
  kind: 'video';
  model: string;
  prompt: string;
  aspect: string;
  count: number;
  duration: number;
  resolution: string;
}
/** One shot of a shot-list batch (POST /api/media/quote {kind: 'shots'}). */
export interface ShotItem {
  /** Stable id of the shot in the user's list (see lib/media/shotlist.ts). */
  shotId: string;
  /** Hierarchy tier 0-4 the item is generated at. */
  tier: number;
  model: string;
  prompt: string;
  resolution: string;
  /** Seconds; ignored by Omni (it picks 3-10 s), which is quoted at its maximum. */
  duration: number;
}
/** Several different video prompts quoted and generated as ONE request (so the per-request cap covers the batch). */
export interface ShotBatchRequest {
  kind: 'shots';
  aspect: string;
  items: ShotItem[];
}
export interface VoiceRequest {
  kind: 'voice';
  model: string;
  voiceId: string;
  text: string;
  stability: number;
  similarity: number;
}

export interface ImageModelInfo {
  id: string;
  /** Per-image price in USD (default quality), from the xAI models endpoint. */
  priceUsd: number;
  /** Present for models with price tiers (quality x resolution). */
  tiers?: { quality: string; resolution: string; priceUsd: number }[];
  maxPromptLength: number;
}
export interface VideoModelInfo {
  id: string;
  /** USD per second by output resolution (published pricing; est.). */
  perSecondUsd: Record<string, number>;
  resolutions: string[];
  provider?: MediaProvider;
  /** Aspect ratios the model accepts (all of VIDEO_ASPECTS when absent). */
  aspects?: string[];
  /** Model chooses the length itself, up to this many seconds (quoted at this maximum). */
  maxAutoSeconds?: number;
}
export interface VoiceInfo {
  id: string;
  name: string;
  category: string;
  description?: string;
  previewUrl?: string;
}
export interface VoiceModelInfo {
  id: string;
  name: string;
  /** Credits per character (0.5 for Flash/Turbo models). */
  creditMultiplier: number;
  maxChars: number;
}
export interface ElevenQuota {
  tier: string;
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string | null;
}

/** Today's recorded spend (local calendar day) against the server-enforced daily cap. */
export interface DailySpend {
  date: string;
  /** Generations manifest est. USD for files saved today. */
  generationsUsd: number;
  /** Podcast Gemini TTS USD for episodes created today (list price from reported usage). */
  podcastUsd: number;
  totalUsd: number;
  capUsd: number;
  remainingUsd: number;
  perRequestCapUsd: number;
}

export interface MediaStatus {
  now: string;
  storage: { ok: true; root: string; freeBytes: number } | { ok: false; root: string; reason: string };
  /** Generations-only est. spend today (kept for older clients; see `spend` for the capped total). */
  todaySpendUsd: number;
  /** Null when the spend ledger couldn't be read (paid generation is then refused). */
  spend: DailySpend | null;
  xai:
    | { configured: false; missing: 'XAI_API_KEY' }
    | {
        configured: true;
        imageModels: ImageModelInfo[];
        videoModels: VideoModelInfo[];
        /** Why a family is empty (e.g. key has no video access); shown instead of faking it. */
        imageError?: string;
        videoError?: string;
      };
  gemini: { configured: false; missing: 'GEMINI_API_KEY' } | { configured: true; videoModels: VideoModelInfo[] };
  elevenlabs:
    | { configured: false; missing: 'ELEVENLABS_API_KEY' }
    | { configured: true; voices: VoiceInfo[]; models: VoiceModelInfo[]; quota: ElevenQuota | null; error?: string };
}

export interface Quote {
  quoteId: string;
  expiresAt: string;
  kind: MediaKind;
  /** 'mixed' for a shot batch that spans providers. */
  provider: MediaProvider | 'mixed';
  model: string;
  count: number;
  estUsd: number;
  /** Human breakdown, e.g. "2 images x $0.02". */
  breakdown: string;
  outputDir: string;
  /** Voice: credits this request uses and the quota left after it. */
  credits?: number;
  creditsRemainingAfter?: number;
  /** Today's spend before this request and the daily cap it was checked against. */
  daily?: { spentUsd: number; capUsd: number };
  warnings: string[];
}

export interface GenItemRecord {
  id: string;
  kind: MediaKind;
  provider: MediaProvider;
  model: string;
  prompt: string;
  params: Record<string, unknown>;
  file: string;
  bytes: number;
  mime: string;
  estUsd: number;
  created: string;
}

export type JobStatus = 'running' | 'done' | 'failed';
export interface JobState {
  id: string;
  status: JobStatus;
  kind: MediaKind;
  startedAt: string;
  /** Free-text progress, e.g. "video rendering (poll 4)". */
  progress: string;
  items: GenItemRecord[];
  error?: string;
}
