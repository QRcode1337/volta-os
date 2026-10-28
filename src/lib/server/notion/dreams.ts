import 'server-only';
import type { DreamEntry } from '@/types/notion';
import { cached, type CachedOptions } from '../sources/cache';
import { notionQuery, pageTitle, pageUrl, stripDashes, type ListResp, type RawPage } from './client';
import { TTL_MS } from './pages';

// Dreams database (read-only): newest entries by created time, shown with their Date property when it is set.
export const DREAMS_DB_ID = '1125432465df806a926be907218d8ac4';

async function loadDreams(limit: number): Promise<DreamEntry[]> {
  const r = await notionQuery<ListResp<RawPage>>(DREAMS_DB_ID, {
    page_size: limit,
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
  });
  return r.results.map((p) => {
    const d = p.properties?.Date as { type: string; date?: { start: string } | null } | undefined;
    const start = d?.date?.start ?? null;
    return {
      id: stripDashes(p.id),
      title: pageTitle(p) || 'Untitled dream',
      date: start ?? p.created_time ?? null,
      dateSource: start ? 'date' : 'created',
      url: p.url ?? pageUrl(p.id),
    } satisfies DreamEntry;
  });
}

export function getDreams(limit = 5, opts: Pick<CachedOptions, 'force' | 'minForceMs'> = {}): Promise<DreamEntry[]> {
  return cached(`notion:dreams:${limit}`, TTL_MS, () => loadDreams(limit), { maxStaleMs: 24 * 3_600_000, ...opts });
}
