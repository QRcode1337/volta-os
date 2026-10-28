import { route } from '@/lib/server/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cheapest possible route: the Systems page's self-probe of the VOLTA server (request latency, not page work). */
export const GET = route(() => ({ ok: true }));
