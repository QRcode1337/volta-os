import { localJson } from '@/lib/server/route-helpers';
import { getQuota } from '@/lib/server/quota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/quota[?refresh=1]
 * CodexBar subscription limits (session %, weekly %, reset times) plus OmniRoute per-provider usage today / this week,
 * connection state and circuit breakers. Cached 60 s server-side; `refresh=1` forces a rebuild.
 */
export const GET = localJson((req) => getQuota({ refresh: new URL(req.url).searchParams.get('refresh') === '1' }));
