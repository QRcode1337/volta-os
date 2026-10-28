import { route } from '@/lib/server/route-helpers';
import { getDays } from '@/lib/server/ltm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(({ url }) => ({ days: getDays(Math.min(Math.max(Number(url.searchParams.get('top')) || 6, 1), 40)) }), { tag: 'ltm' });
