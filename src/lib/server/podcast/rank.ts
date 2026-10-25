import 'server-only';
import { jevConfigured, rank as jevRank } from '../jev';
import type { PodcastConfig, Story } from './types';
import type { Candidate } from './candidates';
import { clip, jaccard, normUrl, round, tokens } from './util';

// Stage 2: de-duplicate across origins, rank (JEV when available, silently skipped otherwise) and pick the top 6-10.

const ORIGIN_PRIORITY: Record<string, number> = { research: 0, arxiv: 1, notion: 2, rss: 3, feeds: 4 };
const EVIDENCE_Q = { 'verified-web': 1, 'primary-abstract': 0.8, internal: 0.55, 'feed-summary': 0.4 } as const;
const CONF_Q = { high: 1, medium: 0.65, low: 0.3 } as const;

export function dedupe(cands: Candidate[], cfg: PodcastConfig): Candidate[] {
  const weightOf = (id: string) => cfg.topics.find((t) => t.id === id)?.weight ?? 0;
  const sorted = [...cands].sort((a, b) => ORIGIN_PRIORITY[a.origins[0]] - ORIGIN_PRIORITY[b.origins[0]]);
  const clusters: { c: Candidate; urls: Set<string>; toks: Set<string> }[] = [];
  for (const c of sorted) {
    const urls = new Set(c.sources.map((s) => normUrl(s.url)).filter(Boolean));
    const toks = tokens(c.headline);
    const hit = clusters.find((k) => [...urls].some((u) => k.urls.has(u)) || jaccard(toks, k.toks) >= 0.5);
    if (!hit) {
      clusters.push({ c: { ...c, sources: [...c.sources], origins: [...c.origins] }, urls, toks });
      continue;
    }
    const base = hit.c;
    for (const s of c.sources) {
      const u = normUrl(s.url);
      if (u ? !hit.urls.has(u) : !base.sources.some((x) => x.title === s.title)) base.sources.push(s);
      if (u) hit.urls.add(u);
    }
    if (!base.origins.includes(c.origins[0])) {
      base.origins.push(c.origins[0]);
      base.corroboration += 1;
    }
    if (CONF_Q[c.confidence] > CONF_Q[base.confidence]) base.confidence = c.confidence;
    if (weightOf(c.topic) > weightOf(base.topic)) base.topic = c.topic;
    if (!base.whyItMatters && c.whyItMatters) base.whyItMatters = c.whyItMatters;
    if (!base.date && c.date) base.date = c.date;
  }
  return clusters.map((k) => k.c);
}

function quality(c: Candidate, cfg: PodcastConfig, nowMs: number): number {
  const ageH = c.date ? Math.max(0, (nowMs - Date.parse(`${c.date}T12:00:00`)) / 3600_000) : cfg.windowHours;
  const recency = Math.max(0, 1 - ageH / (cfg.windowHours * 1.75));
  return 0.35 * EVIDENCE_Q[c.evidence] + 0.25 * CONF_Q[c.confidence] + 0.2 * recency + 0.2 * Math.min(1, (c.corroboration - 1) / 2 + (c.sources.length > 1 ? 0.25 : 0));
}

export interface Ranked {
  stories: Story[];
  runnersUp: Story[];
  poolSize: number;
  jevUsed: boolean;
}

function criterion(cfg: PodcastConfig): string {
  const focus = cfg.topics.filter((t) => t.focus && t.weight > 0).map((t) => t.label.toLowerCase());
  return (
    'How significant, novel and concrete is this development for a technically curious daily-briefing listener? ' +
    `Weight heavily anything touching ${focus.join(', ')}. ` +
    'Prefer verified, primary-source results (papers, official announcements, hardware demonstrations) over commentary, opinion, funding gossip or hype.'
  );
}

export async function rankAndSelect(cands: Candidate[], cfg: PodcastConfig, onDetail: (s: string) => void): Promise<Ranked> {
  const nowMs = Date.now();
  const pool = dedupe(cands.filter((c) => (cfg.topics.find((t) => t.id === c.topic)?.weight ?? 0) > 0), cfg);
  const maxW = Math.max(1, ...cfg.topics.map((t) => t.weight));
  const wOf = (id: string) => (cfg.topics.find((t) => t.id === id)?.weight ?? 0) / maxW;

  // JEV scores at most the 60 most promising (batches of 8 run 4-wide); anything beyond is ranked on heuristics only.
  const pre = pool.map((c) => ({ c, q: quality(c, cfg, nowMs) })).sort((a, b) => b.q * (0.5 + wOf(b.c.topic)) - a.q * (0.5 + wOf(a.c.topic)));
  const jev = new Map<string, number>();
  let jevUsed = false;
  if (jevConfigured() && pre.length > 1) {
    try {
      onDetail(`ranking ${Math.min(pre.length, 60)} of ${pool.length} candidates with JEV`);
      const r = await jevRank(
        { items: pre.slice(0, 60).map(({ c }) => ({ id: c.key, text: `[${c.topic}] ${c.headline}. ${clip(c.whatHappened, 900)}` })), criterion: criterion(cfg) },
        { timeoutMs: 30_000 },
      );
      for (const row of r.ranked) jev.set(String(row.id), row.score / Math.max(1, r.max));
      jevUsed = jev.size > 0;
    } catch {
      jevUsed = false; // unavailable: skip silently
    }
  }

  const scored = pre.map(({ c, q }) => {
    const j = jev.get(c.key);
    const base = j !== undefined ? 0.5 * j + 0.5 * q : q;
    return { c, jev: j ?? null, score: base * (0.55 + 0.45 * wOf(c.topic)) };
  });

  // Selection: guarantee the strongest story of each focus topic, then fill by score with a diminishing return per topic.
  const n = Math.min(10, Math.max(6, cfg.storyCount));
  const picked: typeof scored = [];
  const take = (x: (typeof scored)[number]) => {
    if (!picked.includes(x)) picked.push(x);
  };
  const MIN_FOCUS = 0.3;
  for (const t of cfg.topics.filter((t) => t.focus && t.weight >= 4)) {
    const best = scored.filter((x) => x.c.topic === t.id).sort((a, b) => b.score - a.score)[0];
    if (best && best.score >= MIN_FOCUS && picked.length < n) take(best);
  }
  while (picked.length < n) {
    const left = scored.filter((x) => !picked.includes(x));
    if (!left.length) break;
    const adj = (x: (typeof scored)[number]) => x.score * (1 - 0.2 * picked.filter((p) => p.c.topic === x.c.topic).length);
    take(left.sort((a, b) => adj(b) - adj(a))[0]);
  }
  picked.sort((a, b) => b.score - a.score);

  const toStory = (x: (typeof scored)[number], i: number): Story => ({
    id: `S${i + 1}`,
    topic: x.c.topic,
    headline: x.c.headline,
    whatHappened: x.c.whatHappened,
    whyItMatters: x.c.whyItMatters,
    sources: x.c.sources,
    date: x.c.date,
    confidence: x.c.confidence,
    evidence: x.c.evidence,
    origins: x.c.origins,
    score: round(x.score),
    jev: x.jev === null ? null : round(x.jev),
  });
  const rest = scored.filter((x) => !picked.includes(x)).sort((a, b) => b.score - a.score);
  return { stories: picked.map(toStory), runnersUp: rest.slice(0, 6).map((x, i) => toStory(x, i)), poolSize: pool.length, jevUsed };
}
