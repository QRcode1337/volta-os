import 'server-only';
import type { EpisodeRecord, PodcastConfig } from './types';
import { notesHtml } from './notes';
import { escXml } from './util';

// Private RSS 2.0 + iTunes tags. Enclosure URLs carry the token so a podcast app can fetch them without any header.

const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
const rfc822 = (iso: string) => new Date(iso).toUTCString();

export function feedUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, '')}/api/podcast/feed.xml?token=${encodeURIComponent(token)}`;
}

export function buildFeedXml(cfg: PodcastConfig, episodes: EpisodeRecord[], base: string, token: string): string {
  const b = base.replace(/\/+$/, '');
  const t = encodeURIComponent(token);
  const self = feedUrl(b, token);
  const cover = `${b}/api/podcast/cover?token=${t}`;
  const items = episodes
    .sort((x, y) => y.date.localeCompare(x.date))
    .slice(0, 60)
    .map((ep) => {
      const url = `${b}/api/podcast/file?token=${t}&date=${ep.date}&f=${ep.date}.mp3`;
      return [
        '<item>',
        `<title>${escXml(ep.title)}</title>`,
        `<description>${cdata(notesHtml(ep))}</description>`,
        `<content:encoded>${cdata(notesHtml(ep))}</content:encoded>`,
        `<pubDate>${rfc822(ep.createdAt)}</pubDate>`,
        `<guid isPermaLink="false">volta-daily-briefing-${ep.date}</guid>`,
        `<enclosure url="${escXml(url)}" length="${ep.bytes}" type="audio/mpeg"/>`,
        `<itunes:duration>${ep.durationSec}</itunes:duration>`,
        '<itunes:explicit>false</itunes:explicit>',
        '<itunes:episodeType>full</itunes:episodeType>',
        '</item>',
      ].join('');
    });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    '<channel>',
    `<title>${escXml(cfg.title)}</title>`,
    `<link>${escXml(b)}/apps/podcast</link>`,
    `<description>${escXml(cfg.description)}</description>`,
    `<language>${escXml(cfg.language)}</language>`,
    `<atom:link href="${escXml(self)}" rel="self" type="application/rss+xml"/>`,
    `<lastBuildDate>${rfc822(new Date().toISOString())}</lastBuildDate>`,
    `<itunes:author>${escXml(cfg.author)}</itunes:author>`,
    `<itunes:summary>${escXml(cfg.description)}</itunes:summary>`,
    '<itunes:type>episodic</itunes:type>',
    '<itunes:explicit>false</itunes:explicit>',
    '<itunes:block>yes</itunes:block>',
    '<itunes:category text="Technology"/>',
    `<itunes:image href="${escXml(cover)}"/>`,
    `<image><url>${escXml(cover)}</url><title>${escXml(cfg.title)}</title><link>${escXml(b)}/apps/podcast</link></image>`,
    ...items,
    '</channel>',
    '</rss>',
    '',
  ].join('\n');
}
