import 'server-only';

/** xAI reports prices in "ticks": 1 USD = 1e10 ticks (image_price 200000000 = $0.02). */
export const TICKS_PER_USD = 1e10;

/**
 * Published xAI Imagine video pricing, USD per output second by resolution (docs.x.ai model pages).
 * The models endpoint does not return video prices, so this table is what "est." is based on.
 * A model missing here is not offered (no price = no spend).
 */
export const VIDEO_PRICES: Record<string, Record<string, number>> = {
  'grok-imagine-video-1.5': { '480p': 0.08, '720p': 0.14, '1080p': 0.25 },
  'grok-imagine-video-1.5-lite': { '480p': 0.02, '720p': 0.03, '1080p': 0.14 },
  'grok-imagine-video': { '480p': 0.05, '720p': 0.07 },
};

/**
 * Gemini Omni Flash video, USD per output second (ai.google.dev/gemini-api/docs/pricing: $17.50 / 1M output video
 * tokens, "an effective price of approximately $0.10 per second" at 720p). Google publishes no 360p/1080p/4K rate,
 * so only 720p is offered. Omni picks the clip length itself (3-10 s), so quotes assume the 10 s maximum.
 * Veo 3.1 is not listed: Google shut its Gemini API preview down on 2026-10-22 (Cloud/Vertex only now).
 */
export const OMNI_MODEL = 'gemini-omni-1.1-flash';
export const OMNI_PRICES: Record<string, number> = { '720p': 0.1 };
export const OMNI_MAX_SECONDS = 10;
export const OMNI_ASPECTS = ['16:9', '9:16'] as const;

/**
 * ElevenLabs plan price / monthly credits, used to turn credits into dollars (est.). The free plan has a hard
 * quota and no overage, so its marginal cost is $0; paid tiers are priced at their included-credit rate.
 */
export const ELEVEN_TIER_RATE: Record<string, { usd: number; credits: number }> = {
  starter: { usd: 5, credits: 30_000 },
  creator: { usd: 22, credits: 100_000 },
  pro: { usd: 99, credits: 500_000 },
  scale: { usd: 330, credits: 2_000_000 },
  business: { usd: 1_320, credits: 11_000_000 },
};

export function elevenUsdPerCredit(tier: string): number {
  const r = ELEVEN_TIER_RATE[tier.toLowerCase()];
  return r ? r.usd / r.credits : 0;
}

export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
