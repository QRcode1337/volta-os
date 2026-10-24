import { localJson } from '@/lib/server/route-helpers';
import { getToday, isIsoDate } from '@/lib/server/ltm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/ltm/today?date=yyyy-mm-dd&recent=30 — `recent` (1–50, default 5) newest captures of that day.
export const GET = localJson((req) => {
  const sp = new URL(req.url).searchParams;
  const date = sp.get('date');
  const recent = Number(sp.get('recent')) || 5;
  return getToday(isIsoDate(date) ? date : undefined, recent);
});
