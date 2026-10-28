import { route } from '@/lib/server/route-helpers';
import { getActivity } from '@/lib/server/ltm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(({ url }) => getActivity(Math.min(Math.max(Number(url.searchParams.get('days')) || 14, 1), 60)), { tag: 'ltm' });
