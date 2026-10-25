// GET /api/research/status[?refresh=1]  coverage per root, indexer state, vault and graph health, Phase 2 note.
// refresh=1 rebuilds the inventory now (rate limited to one build per 15 s).
import { localJson } from '@/lib/server/route-helpers';
import { getStatus } from '@/lib/server/research/status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = localJson((req) => getStatus({ refresh: new URL(req.url).searchParams.get('refresh') === '1' }));
