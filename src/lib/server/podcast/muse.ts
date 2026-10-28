import 'server-only';
import { HttpError } from '../http-error';
import type { EpisodeRecord } from './types';
import { localDate } from './util';
import { enqueueMissing } from './enrich';

// External episode source: a muse.ai podcast feed (config/podcast.json -> externalFeed). Episodes are produced and hosted by
// muse.ai, so nothing is generated, stored or billed here: we read the RSS and play/redirect to the enclosure URLs.

const TTL_MS = 5 * 60_000;
let cache: { url: string; at: number; episodes: EpisodeRecord[] } | null = null;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .trim();
const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
};

export function parseMuseFeed(xml: string): EpisodeRecord[] {
  const seen = new Set<string>();
  const out: EpisodeRecord[] = [];
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const enc = item.match(/<enclosure\s[^>]*>/i)?.[0] ?? '';
    const audioUrl = decode(enc.match(/url="([^"]+)"/i)?.[1] ?? '');
    const when = new Date(tag(item, 'pubDate'));
    if (!audioUrl || Number.isNaN(when.getTime())) continue;
    const date = localDate(when);
    if (seen.has(date)) continue; // one episode per day; the feed is newest first
    seen.add(date);
    const description = tag(item, 'description');
    out.push({
      date,
      title: tag(item, 'title') || `Briefing ${date}`,
      description,
      file: '',
      notesFile: '',
      scriptFile: '',
      bytes: Number(enc.match(/length="(\d+)"/i)?.[1] ?? 0),
      durationSec: Number(tag(item, 'itunes:duration')) || 0,
      words: 0,
      createdAt: when.toISOString(),
      stories: [],
      topicsCovered: [],
      scriptBackend: 'muse.ai',
      ttsModel: 'muse.ai',
      cost: { ttsUsd: 0, ttsInputTokens: 0, ttsAudioTokens: 0, claudeListUsd: 0 },
      timings: [],
      researchMs: 0,
      jevUsed: false,
      warnings: [],
      audioUrl,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export async function museEpisodes(url: string): Promise<EpisodeRecord[]> {
  if (cache && cache.url === url && Date.now() - cache.at < TTL_MS) return cache.episodes;
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const episodes = parseMuseFeed(await res.text());
    cache = { url, at: Date.now(), episodes };
    void enqueueMissing(episodes).catch(() => {});
    return episodes;
  } catch (err) {
    if (cache && cache.url === url) return cache.episodes; // stale beats nothing
    throw new HttpError(`Could not load the muse.ai feed: ${(err as Error).message}`, 502);
  }
}
