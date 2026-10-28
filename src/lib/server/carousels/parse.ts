import 'server-only';
import type { NotionPageDoc } from '@/types/notion';
import type { Deck, Slide } from '@/components/media/data';
import { stripMarkdown } from '@/lib/text';

// Shorts/TikTok pages in Notion keep one block per video:
//   ### S01 — Title  (flags like "(bench)" or "⭐ SHORT #1" may trail it)
//   **Episode:** … **Source:** … **HOOK:** … **VO:** … **CARDS:** a · b · c   [**CAPTION:** …]
// Each block becomes a deck: slide 1 = the hook, then the voiceover in beats, then the call-to-action line.
// Nothing is invented: every slide is a slice of the Notion text.

const FIELD = /^\*\*([A-Za-z][A-Za-z /]*?):\*\*\s*(.*)$/;
const HEAD = /^#{2,4}\s+(.*)$/;
const TITLE_NUM = /^S?(\d{1,3})\s*[—–:.)-]\s*(.+)$/i;

export interface ParsedShort {
  number: number | null;
  title: string;
  fields: Record<string, string>;
  bench: boolean;
  lead: boolean;
}

export function parseShorts(md: string): ParsedShort[] {
  const lines = md.split('\n');
  const out: ParsedShort[] = [];
  let cur: { title: string; lines: string[] } | null = null;
  const close = () => {
    if (!cur) return;
    const fields: Record<string, string> = {};
    let key: string | null = null;
    for (const l of cur.lines) {
      const m = l.trim().match(FIELD);
      if (m) {
        key = m[1].trim().toUpperCase();
        fields[key] = m[2];
      } else if (!l.trim()) key = null;
      else if (key) fields[key] += ` ${l.trim()}`;
    }
    if (fields.HOOK || fields.VO) {
      const raw = cur.title;
      const m = stripMarkdown(raw.replace(/⭐.*$/, '').replace(/\(bench\)/i, '')).match(TITLE_NUM);
      out.push({
        number: m ? Number(m[1]) : null,
        title: (m ? m[2] : stripMarkdown(raw.replace(/⭐.*$/, '').replace(/\(bench\)/i, ''))).trim(),
        fields,
        bench: /\(bench\)/i.test(raw),
        lead: /⭐/.test(raw),
      });
    }
    cur = null;
  };
  let fence = false;
  for (const line of lines) {
    if (/^```/.test(line)) fence = !fence;
    const h = fence ? null : line.match(HEAD);
    if (h) {
      close();
      cur = { title: h[1].trim(), lines: [] };
    } else if (cur) cur.lines.push(line);
  }
  close();
  return out;
}

const SENT = /(?<=[.!?…])["”')\]]*\s+(?=["“(\[]?[A-Z0-9~$#])/;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Split voiceover into `n` consecutive groups of whole sentences, balanced by word count. */
export function groupSentences(sentences: string[], n: number): string[] {
  if (sentences.length <= n) return sentences;
  // cut after the sentence whose running word count is closest to k/n of the total (cuts strictly increase)
  const cum: number[] = [];
  sentences.reduce((acc, s, i) => (cum[i] = acc + words(s)), 0);
  const total = cum[cum.length - 1];
  const cuts: number[] = [];
  for (let k = 1; k < n; k++) {
    const want = (total * k) / n;
    const lo = (cuts[cuts.length - 1] ?? -1) + 1;
    const hi = sentences.length - 1 - (n - k); // leave one sentence for each later group
    let best = lo;
    for (let i = lo; i <= hi; i++) if (Math.abs(cum[i] - want) < Math.abs(cum[best] - want)) best = i;
    cuts.push(best);
  }
  const groups: string[][] = [];
  let from = 0;
  for (const c of [...cuts, sentences.length - 1]) {
    groups.push(sentences.slice(from, c + 1));
    from = c + 1;
  }
  return groups.map((g) => g.join(' '));
}

const headlineFrom = (text: string) => {
  const first = text.split(/[,;:—–]|\.\s/)[0].trim();
  const w = first.split(/\s+/);
  return (w.length > 9 ? `${w.slice(0, 8).join(' ')}…` : first).replace(/[.,]$/, '');
};

const CTA = /\b(full file|full episode|watch the|link in|subscribe|follow)\b/i;

function slidesFor(deckId: string, s: ParsedShort, hook: string): Slide[] {
  const tag = s.number !== null ? `S${String(s.number).padStart(2, '0')}` : 'SHORT';
  const episode = s.fields.EPISODE ? stripMarkdown(s.fields.EPISODE) : null;
  const vo = s.fields.VO ? stripMarkdown(s.fields.VO) : '';
  const cards = (s.fields.CARDS ?? '')
    .split(/\s+·\s+/)
    .map((c) => stripMarkdown(c).replace(/^["“]|["”]$/g, '').trim())
    .filter(Boolean);
  const slides: Slide[] = [
    { id: `${deckId}-1`, kind: 'cover', theme: 'dark', kicker: `${tag}${episode ? ` · ${episode.split(/\s+\(/)[0].replace(/_/g, ' ')}` : ''}`.toUpperCase(), headline: hook, body: s.fields.SOURCE ? `Source: ${stripMarkdown(s.fields.SOURCE)}`.slice(0, 160) : '' },
  ];
  const sentences = vo ? vo.split(SENT).map((x) => x.trim()).filter(Boolean) : [];
  let cta: string | null = null;
  if (sentences.length > 2 && CTA.test(sentences[sentences.length - 1])) cta = sentences.pop() as string;
  if (sentences.length) {
    const n = cards.length >= 3 && cards.length <= 6 ? Math.min(cards.length, sentences.length) : Math.min(Math.max(3, Math.ceil(words(vo) / 24)), 6, sentences.length);
    const groups = groupSentences(sentences, n);
    groups.forEach((g, i) => {
      slides.push({
        id: `${deckId}-${slides.length + 1}`,
        kind: 'point',
        theme: i % 2 === 0 ? 'paper' : 'dark',
        kicker: `BEAT ${i + 1} / ${groups.length}`,
        headline: cards.length === groups.length ? cards[i] : headlineFrom(g),
        body: g,
      });
    });
  }
  if (cta || s.fields.CAPTION) {
    slides.push({ id: `${deckId}-${slides.length + 1}`, kind: 'cta', theme: 'dark', kicker: 'NEXT', headline: cta ?? 'Watch the full file', body: s.fields.CAPTION ? stripMarkdown(s.fields.CAPTION) : '' });
  }
  return slides;
}

/** "Suggested posting order (first 15): S01 → S03 → …" -> [1, 3, …] */
export function postingOrder(md: string): number[] {
  const m = md.match(/posting order[^\n:]*:\**\s*([^\n]+)/i);
  if (!m) return [];
  return [...m[1].matchAll(/\bS(\d{1,3})\b/gi)].map((x) => Number(x[1]));
}

export function decksFromPage(page: NotionPageDoc, handle = 'The Strangest Times'): Deck[] {
  const order = postingOrder(page.markdown);
  const seen = new Set<string>();
  const decks: Deck[] = [];
  parseShorts(page.markdown).forEach((s, idx) => {
    const num = s.number ?? idx + 1;
    const id = `${page.id.slice(0, 8)}-s${String(num).padStart(2, '0')}`;
    if (seen.has(id)) return;
    seen.add(id);
    const hook = stripMarkdown(s.fields.HOOK ?? s.title);
    const q = order.indexOf(num);
    decks.push({
      id,
      postNumber: num,
      title: s.title,
      platform: /tik\s*tok/i.test(page.title) ? 'TIKTOK' : 'YOUTUBE SHORTS',
      handle,
      slides: slidesFor(id, s, hook),
      hook,
      episode: s.fields.EPISODE ? stripMarkdown(s.fields.EPISODE) : null,
      source: s.fields.SOURCE ? stripMarkdown(s.fields.SOURCE) : null,
      voiceover: s.fields.VO ? stripMarkdown(s.fields.VO) : null,
      cards: (s.fields.CARDS ?? '').split(/\s+·\s+/).map((c) => stripMarkdown(c).trim()).filter(Boolean),
      caption: s.fields.CAPTION ? stripMarkdown(s.fields.CAPTION) : null,
      queue: q >= 0 ? q + 1 : null,
      bench: s.bench,
      notionUrl: page.url,
      pageTitle: page.title,
    });
  });
  // posting order first (those with a queue slot), then the rest by number
  return decks.sort((a, b) => (a.queue ?? 1e6) - (b.queue ?? 1e6) || a.postNumber - b.postNumber);
}
