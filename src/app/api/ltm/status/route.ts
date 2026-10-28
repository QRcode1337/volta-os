import { route } from '@/lib/server/route-helpers';
import { getStatus } from '@/lib/server/ltm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(() => getStatus(), { tag: 'ltm' });
