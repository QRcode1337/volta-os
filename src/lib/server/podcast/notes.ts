import 'server-only';
import type { EpisodeRecord, PodcastConfig, ResearchSummary, Story } from './types';

// Show notes (markdown with source links). Built programmatically from the structured stories: nothing here is LLM text,
// so every link is exactly a URL the pipeline collected.

const EVIDENCE_LABEL: Record<Story['evidence'], string> = {
  'verified-web': 'verified: source opened and read',
  'primary-abstract': 'preprint abstract (not peer reviewed)',
  'feed-summary': 'reported, not independently verified',
  internal: 'from VOLTA monitoring (internal)',
};

export const evidenceLabel = (e: Story['evidence']) => EVIDENCE_LABEL[e];

const mdEsc = (s: string) => s.replace(/([\\[\]])/g, '\\$1');

export function sourceLine(s: Story['sources'][number]): string {
  const label = mdEsc(s.title || s.url || 'source');
  const pub = s.publisher && !label.toLowerCase().includes(s.publisher.toLowerCase()) ? ` (${mdEsc(s.publisher)})` : '';
  return s.url ? `[${label}](${s.url})${pub}` : `${label}${pub}`;
}

/** One plain sentence for listeners when web research mostly failed (null when research was healthy). */
export function researchNotice(r: ResearchSummary | undefined): string | null {
  if (!r?.degraded) return null;
  const what = r.skipped ? 'Web research did not run for this episode' : `Web research covered only ${r.succeeded} of ${r.attempted} topics in this episode`;
  return `${what}, so most stories come from feeds and preprints and were not independently verified.`;
}

export function buildNotes(args: {
  cfg: PodcastConfig;
  date: string;
  title: string;
  description: string;
  durationSec: number;
  stories: Story[];
  runnersUp: Story[];
  notices: string[];
  info: string[];
  research?: ResearchSummary;
}): string {
  const { cfg, date, stories } = args;
  const label = (id: string) => cfg.topics.find((t) => t.id === id)?.label ?? id;
  const day = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const limited = researchNotice(args.research);
  const out: string[] = [`# ${args.title}`, '', `*${day} · ${Math.round(args.durationSec / 60)} min · ${stories.length} stories*`, '', args.description, '', ...(limited ? [`> **Limited research.** ${limited}`, ''] : []), '## Stories', ''];
  stories.forEach((s, i) => {
    out.push(`### ${i + 1}. ${s.headline}`, '', `*${label(s.topic)} · ${EVIDENCE_LABEL[s.evidence]} · confidence ${s.confidence}${s.date ? ` · ${s.date}` : ''}* · cited as [${s.id}]`, '', s.whatHappened, '');
    if (s.whyItMatters) out.push(`**Why it matters:** ${s.whyItMatters}`, '');
    out.push('**Sources**', '', ...s.sources.map((x) => `- ${sourceLine(x)}`), '');
  });
  if (args.runnersUp.length) {
    out.push('## Also on the radar (not covered)', '', ...args.runnersUp.filter((s) => s.sources[0]?.url).map((s) => `- [${mdEsc(s.headline)}](${s.sources[0].url}) (${label(s.topic)})`), '');
  }
  out.push('## About this episode', '', ...args.info.map((x) => `- ${x}`));
  if (args.notices.length) out.push('', '### Notices', '', ...args.notices.map((x) => `- ${x}`));
  out.push('');
  return out.join('\n');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Compact HTML for the RSS item description (podcast apps render basic HTML). */
export function notesHtml(ep: EpisodeRecord): string {
  const limited = researchNotice(ep.research);
  const parts = [`<p>${esc(ep.description)}</p>`, ...(limited ? [`<p><i>Limited research: ${esc(limited)}</i></p>`] : [])];
  ep.stories.forEach((s, i) => {
    const links = s.sources
      .filter((x) => x.url)
      .map((x) => `<a href="${esc(x.url)}">${esc(x.publisher || x.title || x.url)}</a>`)
      .join(' · ');
    parts.push(`<p><b>${i + 1}. ${esc(s.headline)}</b><br/>${esc(s.whatHappened.slice(0, 420))}${s.whatHappened.length > 420 ? '…' : ''}${links ? `<br/>Sources: ${links}` : ''}</p>`);
  });
  return parts.join('');
}
