import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { safeHttpUrl } from './safe';
import type { NotionData, NotionPin } from './types';

// Pinned Notion links: config/notion-links.json ([{label,url,kind?}]) with a hard-coded fallback, plus the
// most-visited pages from config/notion-pages.json ({title: url}). Only notion.so / notion.site URLs are passed on.

const FALLBACK_PINS: NotionPin[] = [
  { label: 'Dreams', url: 'https://www.notion.so/1125432465df806a926be907218d8ac4', kind: 'database' },
  { label: 'My Life Wiki', url: 'https://www.notion.so/4ef54729a2f140e2a284d1c814555eaa', kind: 'database' },
  { label: 'Video Production', url: 'https://www.notion.so/0f001eb37cd3417e8ba827621bb94c66', kind: 'page' },
];

const CONFIG_DIR = path.join(process.cwd(), 'config');

function notionUrl(raw: unknown): string | null {
  const u = safeHttpUrl(raw);
  if (!u) return null;
  const host = new URL(u).hostname;
  return host === 'notion.so' || host.endsWith('.notion.so') || host.endsWith('.notion.site') ? u : null;
}

async function readJson(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(CONFIG_DIR, file), 'utf8'));
  } catch {
    return null;
  }
}

function pinsFrom(json: unknown): NotionPin[] {
  const list = Array.isArray(json) ? json : Array.isArray((json as { links?: unknown })?.links) ? (json as { links: unknown[] }).links : [];
  const out: NotionPin[] = [];
  for (const it of list) {
    const o = it as { label?: unknown; title?: unknown; url?: unknown; kind?: unknown };
    const url = notionUrl(o?.url);
    const label = typeof o?.label === 'string' ? o.label : typeof o?.title === 'string' ? o.title : null;
    if (url && label) out.push({ label, url, kind: typeof o.kind === 'string' ? o.kind : undefined });
  }
  return out;
}

function pagesFrom(json: unknown): NotionPin[] {
  if (!json || typeof json !== 'object') return [];
  const entries = Array.isArray(json) ? pinsFrom(json).map((p) => [p.label, p.url] as const) : Object.entries(json as Record<string, unknown>);
  const out: NotionPin[] = [];
  for (const [label, raw] of entries) {
    const url = notionUrl(raw);
    if (url) out.push({ label: label.length > 90 ? `${label.slice(0, 87)}...` : label, url });
  }
  return out;
}

export async function notionPins(): Promise<NotionData> {
  const [linksJson, pagesJson] = await Promise.all([readJson('notion-links.json'), readJson('notion-pages.json')]);
  const fromConfig = pinsFrom(linksJson);
  return {
    pins: fromConfig.length ? fromConfig : FALLBACK_PINS,
    pinsSource: fromConfig.length ? 'config' : 'fallback',
    pages: pagesFrom(pagesJson),
  };
}
