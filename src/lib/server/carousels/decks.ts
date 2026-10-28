import 'server-only';
import type { Deck } from '@/components/media/data';
import type { NotionNoAccess } from '@/types/notion';
import { HttpError } from '../http-error';
import { cached, type CachedOptions } from '../sources/cache';
import { getCatalog } from '../notion/catalog';
import { NotionError, pageUrl } from '../notion/client';
import { NO_ACCESS_HINT, TTL_MS, getPage } from '../notion/pages';
import { decksFromPage } from './parse';

// Decks come from every Shorts / TikTok page listed in the Video Production index (+ the known "Shorts Batch 1" page).
const FALLBACK_SHORTS = ['3fe5432465df8155846dd7124014448f'];

export interface DeckSource {
  id: string;
  title: string;
  url: string;
  decks: number;
}

export interface DecksPayload {
  decks: Deck[];
  sources: DeckSource[];
  inaccessible: NotionNoAccess[];
  errors: string[];
  fetchedAt: string;
}

async function load(): Promise<DecksPayload> {
  const errors: string[] = [];
  const inaccessible: NotionNoAccess[] = [];
  let ids: { id: string; title: string }[] = [];
  try {
    const cat = await getCatalog();
    ids = cat.groups.filter((g) => g.kind === 'shorts').flatMap((g) => g.items.map((i) => ({ id: i.id, title: i.title })));
    inaccessible.push(...cat.inaccessible.filter((n) => /short|tiktok|reel/i.test(n.title)));
  } catch (err) {
    if (err instanceof NotionError && err.code === 'not_configured') throw new HttpError(err.message, 503, { notConfigured: true });
    errors.push(`Video Production index: ${(err as Error).message}`);
  }
  for (const id of FALLBACK_SHORTS) if (!ids.some((i) => i.id === id)) ids.push({ id, title: 'Shorts Batch 1' });

  const decks: Deck[] = [];
  const sources: DeckSource[] = [];
  for (const { id, title } of ids) {
    try {
      const page = await getPage(id);
      const d = decksFromPage(page);
      decks.push(...d);
      sources.push({ id, title: page.title, url: page.url, decks: d.length });
    } catch (err) {
      if (err instanceof NotionError && err.noAccess) {
        if (!inaccessible.some((n) => n.id === id)) inaccessible.push({ id, title, url: pageUrl(id), status: err.status, hint: NO_ACCESS_HINT });
      } else errors.push(`${title}: ${(err as Error).message}`);
    }
  }
  return { decks, sources, inaccessible, errors, fetchedAt: new Date().toISOString() };
}

export function getDecks(opts: Pick<CachedOptions, 'force' | 'minForceMs'> = {}): Promise<DecksPayload> {
  return cached('carousels:decks', TTL_MS, load, { maxStaleMs: 24 * 3_600_000, ...opts });
}
