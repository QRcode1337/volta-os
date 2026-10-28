import { HttpError, route } from '@/lib/server/route-helpers';
import { getAppCounts, isIsoDate } from '@/lib/server/ltm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  ({ url }) => {
    const date = url.searchParams.get('date');
    if (date && !isIsoDate(date)) throw new HttpError('date must be yyyy-mm-dd', 400);
    return { apps: getAppCounts(date ?? undefined) };
  },
  { tag: 'ltm' },
);
