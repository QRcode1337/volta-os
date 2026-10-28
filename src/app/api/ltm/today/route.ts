import { route } from '@/lib/server/route-helpers';
import { getToday, isIsoDate } from '@/lib/server/ltm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/ltm/today?date=yyyy-mm-dd&recent=30 — `recent` (1–50, default 5) newest captures of that day.
export const GET = route(
  ({ url }) => {
    const sp = url.searchParams;
    const date = sp.get('date');
    return getToday(isIsoDate(date) ? date : undefined, Number(sp.get('recent')) || 5);
  },
  { tag: 'ltm' },
);
