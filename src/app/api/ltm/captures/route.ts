import { HttpError, intParam, route } from '@/lib/server/route-helpers';
import { isIsoDate, listCaptures } from '@/lib/server/ltm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/ltm/captures?date=yyyy-mm-dd&app=Safari&q=text&from=1&to=9&limit=200&offset=0&order=desc
// Integer params must be non-negative integers (400 otherwise); listCaptures clamps limit to 1–5000.
export const GET = route(
  ({ url }) => {
    const sp = url.searchParams;
    const date = sp.get('date');
    if (date && !isIsoDate(date)) throw new HttpError('date must be yyyy-mm-dd', 400);
    const q = sp.get('q')?.trim() || undefined;
    if (q && q.length > 200) throw new HttpError('q too long', 400);
    return listCaptures({
      date: date ?? undefined,
      app: sp.get('app') || undefined,
      q,
      from: intParam(url, 'from'),
      to: intParam(url, 'to'),
      limit: intParam(url, 'limit'),
      offset: intParam(url, 'offset'),
      order: sp.get('order') === 'asc' ? 'asc' : 'desc',
    });
  },
  { tag: 'ltm' },
);
