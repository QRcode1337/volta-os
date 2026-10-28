import 'server-only';
import { stripMarkdown } from '@/lib/text';
import type { PodcastConfig, SourceRef } from './types';
import { notionConfigured, notionQuery, NotionError, pageTitle, pageUrl, type ListResp, type RawPage } from '../notion/client';
import { getPage } from '../notion/pages';
import { classifyTopic, type Candidate } from './candidates';
import { mapLimit } from '../proc';
import { clip, errMsg, sleep, stripHtml } from './util';

// Stage 1a: the fixed sources (Notion reports, arXiv, RSS, VOLTA Feeds). Each reader is independent: a failure
// becomes a warning/notice and the rest of the episode still gets built.

export interface Gathered {
  candidates: Candidate[];
  /** Shown in the app (e.g. the Notion database is not shared with the integration). */
  notices: string[];
  counts: Record<string, number>;
}

const UA = 'VOLTA-OS-Daily-Briefing/1.0 (+personal podcast; contact: local)';
const toDate = (ms: number | string | null | undefined): string | null => {
  const t = typeof ms === 'string' ? Date.parse(ms) : ms ?? NaN;
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
};

async function fetchText(url: string, timeoutMs = 20_000): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ───────────── Notion: Frontier Signal Synthesis Reports ─────────────

async function readNotion(cfg: PodcastConfig, sinceMs: number): Promise<{ items: Candidate[]; notice?: string }> {
  if (!notionConfigured()) return { items: [], notice: 'Notion: NOTION_TOKEN is not set in .env.local, so Frontier Signal Synthesis Reports were skipped.' };
  let rows: RawPage[];
  try {
    const r = await notionQuery<ListResp<RawPage>>(cfg.notion.databaseId, {
      page_size: 20,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      filter: { timestamp: 'last_edited_time', last_edited_time: { on_or_after: new Date(sinceMs).toISOString() } },
    });
    rows = r.results;
  } catch (e) {
    if (e instanceof NotionError && e.noAccess) {
      return { items: [], notice: 'Notion: the "Frontier Signal Synthesis Reports" database is not shared with the VOLTA integration. In Notion open the database, then ••• → Connections → add VOLTA. Skipped for now.' };
    }
    return { items: [], notice: `Notion: ${errMsg(e)}` };
  }
  const items = await mapLimit(rows.slice(0, cfg.notion.maxItems), 2, async (p): Promise<Candidate | null> => {
    try {
      const doc = await getPage(p.id);
      const title = doc.title || pageTitle(p) || 'Untitled report';
      const body = stripMarkdown(doc.markdown, { oneLine: true });
      const { topic } = classifyTopic(`${title} ${body}`, cfg.topics, 'ai');
      return {
        key: `notion:${p.id}`,
        topic,
        headline: title,
        whatHappened: clip(body, 1800),
        whyItMatters: '',
        sources: [{ url: pageUrl(p.id), title: `${title} (Notion, Frontier Signal Synthesis Reports)`, publisher: 'Notion', kind: 'secondary' }],
        date: toDate(p.last_edited_time),
        confidence: 'medium',
        evidence: 'internal',
        origins: ['notion'],
        corroboration: 1,
      };
    } catch {
      return null;
    }
  });
  return { items: items.filter((x): x is Candidate => !!x) };
}

// ───────────── arXiv ─────────────

interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  published: number;
  authors: string[];
  cats: string[];
  link: string;
}

const tag = (xml: string, name: string): string => (xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))?.[1] ?? '').trim();

function parseArxiv(xml: string): ArxivEntry[] {
  const out: ArxivEntry[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)) {
    const e = m[1];
    const id = tag(e, 'id');
    out.push({
      id,
      title: stripHtml(tag(e, 'title')),
      summary: stripHtml(tag(e, 'summary')),
      published: Date.parse(tag(e, 'published')),
      authors: [...e.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/gi)].map((a) => stripHtml(a[1])).slice(0, 4),
      cats: [...e.matchAll(/<category[^>]*term="([^"]+)"/gi)].map((c) => c[1]),
      link: id.replace(/^http:/, 'https:'),
    });
  }
  return out;
}

async function readArxiv(cfg: PodcastConfig, nowMs: number): Promise<Candidate[]> {
  const cats = cfg.arxiv.categories.map((c) => `cat:${c}`).join(' OR ');
  const kws = cfg.arxiv.keywords.map((k) => `all:"${k}"`).join(' OR ');
  const q = new URLSearchParams({ search_query: `(${cats}) AND (${kws})`, sortBy: 'submittedDate', sortOrder: 'descending', max_results: String(cfg.arxiv.maxResults) });
  let xml = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      xml = await fetchText(`https://export.arxiv.org/api/query?${q}`, 30_000);
      break;
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(3500 * (attempt + 1)); // arXiv asks for >= 3 s between calls
    }
  }
  const entries = parseArxiv(xml);
  const within = (h: number) => entries.filter((e) => Number.isFinite(e.published) && nowMs - e.published <= h * 3600_000);
  // arXiv announces on weekdays only: a 48 h window can be empty on Sunday/Monday, so widen it.
  let picked = within(cfg.windowHours);
  if (picked.length < 3) picked = within(cfg.arxiv.widenToHours);
  return picked.slice(0, 30).map((e): Candidate => {
    const { topic } = classifyTopic(`${e.title} ${e.summary}`, cfg.topics, e.cats.some((c) => c.startsWith('physics.optics')) ? 'photonics' : e.cats.some((c) => c === 'q-bio.NC') ? 'bci' : e.cats.some((c) => c === 'cs.NE') ? 'neuromorphic' : 'quantum');
    return {
      key: `arxiv:${e.id}`,
      topic,
      headline: e.title,
      whatHappened: `Preprint (not yet peer reviewed) by ${e.authors.join(', ')}${e.authors.length >= 4 ? ' et al.' : ''}. Abstract: ${clip(e.summary, 1100)}`,
      whyItMatters: '',
      sources: [{ url: e.link, title: `arXiv: ${e.title}`, publisher: 'arXiv', kind: 'primary' }],
      date: toDate(e.published),
      confidence: 'medium',
      evidence: 'primary-abstract',
      origins: ['arxiv'],
      corroboration: 1,
    };
  });
}

// ───────────── RSS / Atom ─────────────

interface FeedEntry {
  title: string;
  link: string;
  published: number;
  summary: string;
}

const cdata = (s: string) => s.replace(/^<!\[CDATA\[|\]\]>$/g, '');
function parseFeed(xml: string): FeedEntry[] {
  const out: FeedEntry[] = [];
  const blocks = [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi), ...xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/gi)];
  for (const m of blocks) {
    const b = m[1];
    const link = tag(b, 'link') && !tag(b, 'link').startsWith('<') ? cdata(tag(b, 'link')) : (b.match(/<link[^>]*?href="([^"]+)"/i)?.[1] ?? '');
    const date = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    out.push({
      title: stripHtml(cdata(tag(b, 'title'))),
      link: link.trim(),
      published: Date.parse(date),
      summary: stripHtml(cdata(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded') || tag(b, 'content'))),
    });
  }
  return out;
}

async function readRss(cfg: PodcastConfig, sinceMs: number): Promise<{ items: Candidate[]; warnings: string[] }> {
  const warnings: string[] = [];
  const lists = await mapLimit(cfg.rss, 3, async (src) => {
    try {
      const entries = parseFeed(await fetchText(src.url));
      const out: Candidate[] = [];
      for (const e of entries) {
        if (!e.title || !/^https?:\/\//i.test(e.link) || !(e.published >= sinceMs)) continue;
        const text = `${e.title} ${e.summary}`;
        const { topic, hits } = classifyTopic(text, cfg.topics, src.topic);
        if (hits === 0 && src.topic === 'ai') continue; // general tech outlets: keep only on-topic items
        out.push({
          key: `rss:${src.id}:${e.link}`,
          topic,
          headline: e.title,
          whatHappened: clip(e.summary || e.title, 700),
          whyItMatters: '',
          sources: [{ url: e.link, title: e.title, publisher: src.label, kind: 'secondary' }],
          date: toDate(e.published),
          confidence: 'medium',
          evidence: 'feed-summary',
          origins: ['rss'],
          corroboration: 1,
        });
      }
      return out;
    } catch (e) {
      warnings.push(`RSS ${src.label}: ${errMsg(e)}`);
      return [];
    }
  });
  return { items: lists.flat(), warnings };
}

// ───────────── VOLTA Feeds (Sentinel + Scout) ─────────────

interface FeedApiItem {
  id: string;
  source: string;
  sourceLabel: string;
  ranAt: string;
  status: string;
  title: string;
  excerpt: string;
  triage: string | null;
}

async function readFeeds(cfg: PodcastConfig, sinceMs: number): Promise<Candidate[]> {
  if (!cfg.feeds.enabled) return [];
  const port = process.env.PORT || '50000';
  let json: { items?: FeedApiItem[] };
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/feeds?limit=100`, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    if (!res.ok) return []; // /api/feeds not there (yet): skip silently
    json = (await res.json()) as { items?: FeedApiItem[] };
  } catch {
    return [];
  }
  const want = new Set(cfg.feeds.sources);
  const rows = (json.items ?? [])
    .filter((i) => want.has(i.source) && i.status === 'ok' && Date.parse(i.ranAt) >= sinceMs && i.triage !== 'noise' && !/^(failed|cron:|llm request rejected|logged; no)/i.test(i.title))
    .sort((a, b) => (a.triage === 'needs-action' ? 0 : 1) - (b.triage === 'needs-action' ? 0 : 1) || b.ranAt.localeCompare(a.ranAt))
    .slice(0, cfg.feeds.maxItems);
  return rows.map((i): Candidate => {
    const text = `${i.title} ${i.excerpt}`;
    const ref: SourceRef = { url: '', title: `VOLTA Feeds · ${i.sourceLabel} (${i.ranAt.slice(0, 10)})`, publisher: i.sourceLabel, kind: 'secondary' };
    return {
      key: `feeds:${i.id}`,
      topic: classifyTopic(text, cfg.topics, 'ai').topic,
      headline: clip(i.title.replace(/^(HIGH|MEDIUM|LOW|CRITICAL):\s*/i, ''), 160),
      whatHappened: clip(i.excerpt || i.title, 800),
      whyItMatters: '',
      sources: [ref],
      date: toDate(i.ranAt),
      confidence: 'medium',
      evidence: 'internal',
      origins: ['feeds'],
      corroboration: 1,
    };
  });
}

export async function gatherFixedSources(cfg: PodcastConfig, onDetail: (s: string) => void): Promise<Gathered> {
  const now = Date.now();
  const since = now - cfg.windowHours * 3600_000;
  const notices: string[] = [];
  const counts: Record<string, number> = {};
  onDetail('reading Notion, arXiv, RSS and Feeds');
  const [notion, arxiv, rss, feeds] = await Promise.all([
    readNotion(cfg, since).catch((e) => ({ items: [] as Candidate[], notice: `Notion: ${errMsg(e)}` })),
    readArxiv(cfg, now).catch((e) => {
      notices.push(`arXiv: ${errMsg(e)}`);
      return [] as Candidate[];
    }),
    readRss(cfg, since).catch((e) => ({ items: [] as Candidate[], warnings: [`RSS: ${errMsg(e)}`] })),
    readFeeds(cfg, since).catch(() => [] as Candidate[]),
  ]);
  if (notion.notice) notices.push(notion.notice);
  notices.push(...rss.warnings);
  counts.notion = notion.items.length;
  counts.arxiv = arxiv.length;
  counts.rss = rss.items.length;
  counts.feeds = feeds.length;
  return { candidates: [...notion.items, ...arxiv, ...rss.items, ...feeds], notices, counts };
}
