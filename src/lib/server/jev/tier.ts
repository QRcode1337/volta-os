import 'server-only';
import { ask, jevConfigured } from './client';
import { recordTier } from './telemetry';
import { JevError, type JevCallMeta, type ModelTierName } from './types';

/**
 * Prompt → Claude tier. One Choice question over the three tiers; the answer's own confidence is
 * what the caller gates rerouting on (see resolveRoutedModel in ./heuristic.ts).
 */
const TIERS: Record<ModelTierName, string> = {
  HAIKU:
    'Small mechanical work a fast cheap model does fine: classify, tag, extract fields, rename, dedupe, clean up, proofread, format, short lookups or summaries of short text, status checks.',
  SONNET:
    'Everyday knowledge work needing solid judgment: drafting and rewriting prose, emails and replies, outlines and scripts, research and comparison, code refactors and debugging, audits and analysis of moderate scope.',
  OPUS: 'Hard or high-stakes work needing the strongest model: strategy and architecture, long multi-step or end-to-end projects, proposals, decks and pitches, pricing and negotiation, brand/taste/creative direction, motion and pacing, novel reasoning or proofs, client-facing deliverables.',
};

export interface TierDecision {
  model: ModelTierName;
  confidence: number;
  probabilities: Record<string, number>;
  meta: JevCallMeta;
}

const PROMPT_CHARS = 6_000;

export async function routeTier(prompt: string, command?: string, opts: { timeoutMs?: number } = {}): Promise<TierDecision> {
  if (!jevConfigured()) throw new JevError('no_key', 'TYPESAFE_JEV_API_KEY is not set');
  const task = (command ? `Skill command: ${command}\n\n${prompt}` : prompt).slice(0, PROMPT_CHARS);
  const { answers, meta } = await ask(
    'route',
    { task },
    { tier: { type: 'choice', instructions: 'Which Claude model tier is the cheapest one that will do the task in `task` well?', criteria: TIERS } },
    opts,
  );
  const a = answers.tier;
  if (!a || a.type !== 'choice' || !(a.choice in TIERS)) throw new JevError('bad_response', 'JEV returned no tier answer');
  const model = a.choice as ModelTierName;
  recordTier(model, false);
  return { model, confidence: Math.round(a.confidence * 1000) / 1000, probabilities: a.probabilities ?? {}, meta };
}
