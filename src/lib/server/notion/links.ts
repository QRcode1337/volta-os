import 'server-only';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { NotionLink } from '@/types/notion';

// Pinned Notion links live in config/notion-links.json (edit the file to add one).
const FILE = path.join(process.cwd(), 'config', 'notion-links.json');

export async function getNotionLinks(): Promise<NotionLink[]> {
  try {
    const raw = JSON.parse(await fsp.readFile(FILE, 'utf8')) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((l): l is NotionLink => !!l && typeof l.label === 'string' && typeof l.url === 'string' && /^https:\/\/www\.notion\.so\//.test(l.url))
      .map((l) => ({ label: l.label, url: l.url, kind: l.kind === 'page' ? 'page' : 'database' }));
  } catch {
    return [];
  }
}
