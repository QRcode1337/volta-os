import 'server-only';
import type { JevRouteResult, ModelTier } from '@/types/os';
import { routeTier } from './tier';
import { recordTier, telemetrySummary } from './telemetry';
import { JevError } from './types';

/**
 * Jev skill router (workspace/product/jev-router.md). Real routing is TypeSafe Jev via ./tier (one Choice question over
 * HAIKU/SONNET/OPUS). The keyword heuristic below is the FALLBACK ONLY: it runs when JEV is unreachable (no key, timeout,
 * 5xx, circuit open) and every result it produces is labelled `source: 'fallback'` with a "fallback" reason prefix.
 * Used by /api/jev-router, /api/skills/run and /api/cache-status.
 */

export type JevTier = Exclude<ModelTier, 'FABLE'>;

/** Requested tiers are only overridden when Jev is at least this confident. */
export const JEV_OVERRIDE_THRESHOLD = 0.8;

const LANES: Record<JevTier, [keyword: string, weight: number][]> = {
  HAIKU: [
    ['grammar', 3], ['typo', 3], ['spelling', 3], ['proofread', 3], ['note', 2], ['capture', 2], ['tag', 2],
    ['classify', 2], ['extract', 2], ['summarise', 2], ['summarize', 2], ['recap', 2], ['transcript', 1.5],
    ['list', 1], ['format', 1.5], ['rename', 2], ['clean', 2], ['cleanup', 2], ['clean-up', 2], ['temp', 1.5],
    ['orphan', 1.5], ['lookup', 1.5], ['enrich', 1.5], ['connector', 1.5], ['quick', 1.5], ['short', 1],
    ['translate', 1.5], ['convert', 1], ['count', 1], ['sort', 1], ['dedupe', 1.5], ['status', 1],
  ],
  SONNET: [
    ['draft', 2], ['write', 1.5], ['email', 1.5], ['reply', 1.5], ['research', 1.5], ['outline', 2], ['script', 1.5],
    ['refactor', 2], ['analyse', 2], ['analyze', 2], ['audit', 2], ['onboard', 2], ['onboarding', 2], ['compare', 1.5],
    ['tone', 2], ['voice', 1.5], ['caption', 1.5], ['thumbnail', 1.5], ['review', 1.5], ['explain', 1.5],
    ['browser', 1.5], ['calibrate', 2], ['tune', 1.5], ['wildcard', 1.5], ['report', 1], ['plan', 1], ['debug', 1.5],
  ],
  OPUS: [
    ['proposal', 3], ['deck', 2.5], ['pitch', 2], ['animate', 3], ['animation', 3], ['motion', 3], ['cut', 2],
    ['edit', 1], ['pacing', 2.5], ['brand', 2.5], ['design system', 3], ['design', 1.5], ['strategy', 3],
    ['architect', 3], ['architecture', 3], ['roadmap', 2], ['negotiate', 2.5], ['pricing', 2], ['long-horizon', 3],
    ['multi-step', 2], ['novel', 1.5], ['taste', 2.5], ['creative', 2], ['client-facing', 2.5], ['sponsor', 2],
    ['reason', 1.5], ['prove', 2], ['complex', 2], ['entire', 1.5], ['end to end', 1.5],
  ],
};

const TIER_ORDER: JevTier[] = ['HAIKU', 'SONNET', 'OPUS'];

// ───────────────────────── Telemetry (real; persisted by src/lib/server/jev/telemetry.ts) ─────────────────────────

/** Sync summary in the UI's telemetry shape. Counters are real: tier decisions, measured spend, persisted on /Volumes/Windsor. */
export function jevTelemetry(): JevRouteResult['telemetry'] {
  return telemetrySummary();
}

// ───────────────────────── Classification ─────────────────────────

/** Small stable string hash (FNV-1a) for deterministic jitter. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function normaliseTier(t: ModelTier): JevTier {
  return t === 'FABLE' ? 'OPUS' : t;
}

export interface JevClassification {
  model: JevTier;
  confidence: number;
  latencySec: number;
  costUsd: number;
  reason: string;
  promptTokens: number;
}

/** Pure, deterministic classification. Does not touch telemetry. */
export function classify(prompt: string, command?: string, prior?: ModelTier): JevClassification {
  const text = `${command ?? ''} ${prompt}`.toLowerCase();
  const promptTokens = Math.max(1, Math.ceil(prompt.length / 4));
  const scores: Record<JevTier, number> = { HAIKU: 0.6, SONNET: 0.8, OPUS: 0.5 }; // base priors (Sonnet = safe default)
  const hits: Record<JevTier, string[]> = { HAIKU: [], SONNET: [], OPUS: [] };

  for (const tier of TIER_ORDER) {
    for (const [kw, w] of LANES[tier]) {
      const re = new RegExp(`(^|[^a-z])${kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}([^a-z]|$)`);
      if (re.test(text)) {
        scores[tier] += w;
        hits[tier].push(kw);
      }
    }
  }

  // Length nudges.
  const notes: string[] = [];
  if (prompt.length > 0 && prompt.length < 160) {
    scores.HAIKU += 1.2;
    notes.push('short prompt');
  } else if (prompt.length > 1_200) {
    scores.OPUS += 2;
    notes.push('long prompt');
  } else if (prompt.length >= 500) {
    scores.SONNET += 1;
    notes.push('medium prompt');
  }

  // Optional tier prior supplied by the caller.
  if (prior) {
    const tier = normaliseTier(prior);
    scores[tier] += 3;
    notes.push(`${command ?? 'skill'} prior ${tier}`);
  }

  const total = TIER_ORDER.reduce((sum, t) => sum + scores[t], 0);
  const model = TIER_ORDER.reduce((best, t) => (scores[t] > scores[best] ? t : best), 'SONNET' as JevTier);
  const confidence = Math.min(0.99, Math.max(0.51, Math.round((0.35 + (scores[model] / total) * 0.75) * 100) / 100));

  const h = hashString(text);
  const latencySec = Math.round((0.0048 + (h % 25) / 10_000) * 10_000) / 10_000; // 0.0048 – 0.0072s
  const costUsd = Math.round(Math.min(0.00009, 0.000032 + promptTokens * 0.00000002) * 1e7) / 1e7;

  const kw = hits[model].slice(0, 3).map((k) => `'${k}'`);
  const reasonParts = [
    kw.length ? `matched ${kw.join(', ')}` : 'no strong keyword signal',
    ...notes,
    `${promptTokens} tok`,
  ];
  const lane = model === 'HAIKU' ? 'lightweight lane' : model === 'SONNET' ? 'drafting/analysis lane' : 'taste/long-horizon lane';
  return {
    model,
    confidence,
    latencySec,
    costUsd,
    promptTokens,
    reason: `${lane}: ${reasonParts.join(' · ')}`,
  };
}

export type JevRouteSource = 'jev' | 'cache' | 'fallback';

/** JevRouteResult plus provenance. Extra fields are additive; existing consumers ignore them. */
export interface JevRouteOutput extends JevRouteResult {
  source: JevRouteSource;
  cached: boolean;
  /** Per-tier probabilities from JEV (empty for fallback). */
  probabilities: Record<string, number>;
  /** Set only for source 'fallback': why JEV was not used. */
  fallbackReason?: string;
}

/**
 * Route via real JEV; on any JEV failure fall back to the heuristic and say so. Always records telemetry.
 * `prior` is the skill's configured tier (frontmatter / the deck's matrix cell): the heuristic weighs it (spec step 3).
 * Real JEV is asked unbiased; the prior still wins there unless JEV clears JEV_OVERRIDE_THRESHOLD (resolveRoutedModel).
 */
export async function routeAndRecord(prompt: string, command?: string, prior?: ModelTier): Promise<JevRouteOutput> {
  const t0 = performance.now();
  try {
    const d = await routeTier(prompt, command);
    return {
      model: d.model,
      confidence: d.confidence,
      latencySec: Math.round(d.meta.latencyMs) / 1000,
      costUsd: d.meta.costUsd,
      reason: `JEV${d.meta.cached ? ' (cached)' : ''}: ${d.model} ${Math.round(d.confidence * 100)}%` + tierSplit(d.probabilities),
      telemetry: jevTelemetry(),
      source: d.meta.cached ? 'cache' : 'jev',
      cached: d.meta.cached,
      probabilities: d.probabilities,
    };
  } catch (e) {
    const code = e instanceof JevError ? e.code : 'unknown';
    const c = classify(prompt, command, prior);
    recordTier(c.model, true);
    return {
      model: c.model,
      confidence: c.confidence,
      latencySec: Math.round(performance.now() - t0) / 1000,
      costUsd: 0,
      reason: `fallback (heuristic, JEV unavailable: ${code}) — ${c.reason}`,
      telemetry: jevTelemetry(),
      source: 'fallback',
      cached: false,
      probabilities: {},
      fallbackReason: code,
    };
  }
}

function tierSplit(p: Record<string, number>): string {
  const parts = Object.entries(p)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${Math.round(v * 100)}%`);
  return parts.length ? ` (${parts.join(' · ')})` : '';
}

/**
 * Decide which tier actually runs, given the user's requested tier and Jev's pick.
 * FABLE is a manual pin and is never rerouted. Otherwise Jev overrides only at ≥ threshold confidence.
 */
export function resolveRoutedModel(requested: ModelTier, jev: Pick<JevRouteResult, 'model' | 'confidence'>): {
  routed: ModelTier;
  overridden: boolean;
} {
  if (requested === 'FABLE') return { routed: 'FABLE', overridden: false };
  if (jev.model !== requested && jev.confidence >= JEV_OVERRIDE_THRESHOLD) return { routed: jev.model, overridden: true };
  return { routed: requested, overridden: false };
}
