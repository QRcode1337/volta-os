import { route } from '@/lib/server/route-helpers';
import { getMemorySources } from '@/lib/server/sources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => ({ sources: await getMemorySources() }));
