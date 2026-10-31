// GET /api/research/status[?refresh=1]  coverage per root, indexer state, vault and graph health, Phase 2 index state.
// refresh=1 rebuilds the inventory now (rate limited to one build per 15 s).
import { route } from '@/lib/server/route-helpers';
import { getStatus } from '@/lib/server/research/status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(({ url }) => getStatus({ refresh: url.searchParams.get('refresh') === '1' }), { redact: true });
