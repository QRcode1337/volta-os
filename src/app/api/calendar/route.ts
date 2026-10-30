import { route } from '@/lib/server/route-helpers';
import { getCalendar } from '@/lib/server/calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Upcoming events (next 30 days) merged from the Google and iCloud iCal feeds. `?refresh=1` refetches (at most every 30 s). */
export const GET = route(async ({ url }) => ({ calendar: await getCalendar({ force: url.searchParams.get('refresh') === '1' }) }));
