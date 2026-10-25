import { localJson } from '@/lib/server/route-helpers';
import { listFeeds } from '@/lib/server/feeds';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/feeds?source=&q=&needsAction=1&unread=1&cursor=&limit=&refresh=1  (localhost only; every string is secret-masked) */
export const GET = localJson(async (req) => {
  const p = new URL(req.url).searchParams;
  const limit = Number(p.get('limit'));
  return listFeeds({
    source: p.get('source') || undefined,
    q: p.get('q')?.slice(0, 200) || undefined,
    needsAction: p.get('needsAction') === '1',
    unread: p.get('unread') === '1',
    cursor: p.get('cursor') || undefined,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    refresh: p.get('refresh') === '1',
  });
});
