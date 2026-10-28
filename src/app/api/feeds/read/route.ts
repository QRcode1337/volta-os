import { HttpError, route } from '@/lib/server/route-helpers';
import { markRead } from '@/lib/server/feeds';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST /api/feeds/read  { ids?: string[], source?: string, all?: boolean, read?: boolean }  -> { changed, persisted, reason? } */
export const POST = route(
  ({ body: b }) => {
    const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === 'string').slice(0, 500) : undefined;
    const source = typeof b.source === 'string' ? b.source : undefined;
    if (!ids?.length && !source && b.all !== true) throw new HttpError('Pass ids, source or all.', 400);
    return markRead({ ids, source, all: b.all === true, read: b.read !== false });
  },
  { json: true, tag: 'volta feeds' },
);
