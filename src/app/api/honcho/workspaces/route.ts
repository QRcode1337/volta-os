import { intParam, route } from '@/lib/server/route-helpers';
import { listWorkspaces } from '@/lib/server/honcho';
import { fromHoncho } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(({ url }) => fromHoncho(listWorkspaces(intParam(url, 'page', { min: 1, max: 10_000, fallback: 1 })!, 100)), { tag: 'honcho' });
