import 'server-only';
import type { Confidence, Evidence, Origin, SourceRef, TopicConfig } from './types';

/** One potential story, from any origin, before de-duplication and ranking. */
export interface Candidate {
  key: string;
  topic: string;
  headline: string;
  whatHappened: string;
  whyItMatters: string;
  sources: SourceRef[];
  date: string | null;
  confidence: Confidence;
  evidence: Evidence;
  origins: Origin[];
  /** Number of independent origins that reported the same thing (set when merging duplicates). */
  corroboration: number;
}

/** Best-matching topic by keyword hits (ties go to the heavier topic). `fallback` when nothing matches. */
export function classifyTopic(text: string, topics: TopicConfig[], fallback: string): { topic: string; hits: number } {
  const hay = text.toLowerCase();
  let best = { topic: fallback, hits: 0, weight: -1 };
  for (const t of topics) {
    let hits = 0;
    for (const k of t.keywords) if (hay.includes(k)) hits += k.length > 8 ? 2 : 1;
    if (hits > best.hits || (hits === best.hits && hits > 0 && t.weight > best.weight)) best = { topic: t.id, hits, weight: t.weight };
  }
  return { topic: best.topic, hits: best.hits };
}
