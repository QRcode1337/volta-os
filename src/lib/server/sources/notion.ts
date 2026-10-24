import 'server-only';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { NotionPage } from '@/types/sources';
import { getNotionTitles } from '../ltm';

// Most-visited Notion pages, ranked from LTM window titles. URLs come from config/notion-pages.json
// ({ "<window title>": "https://www.notion.so/..." }), filled once via the Notion connector.

const MAP_FILE = path.join(process.cwd(), 'config', 'notion-pages.json');

export async function getNotionPages(limit = 8): Promise<NotionPage[]> {
  let urls: Record<string, string> = {};
  try {
    urls = JSON.parse(await fsp.readFile(MAP_FILE, 'utf8')) as Record<string, string>;
  } catch {
    // no map yet
  }
  return getNotionTitles(limit + 4)
    .filter((t) => t.title && t.title !== 'Notion')
    .slice(0, limit)
    .map((t) => ({ ...t, url: urls[t.title] ?? null }));
}
