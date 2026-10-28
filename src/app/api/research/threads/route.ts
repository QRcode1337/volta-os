// GET /api/research/threads  graphify communities as clusters (with member docs), the Stage A cross-domain network, folder bridges, highlights.
import { route } from '@/lib/server/route-helpers';
import { getThreads } from '@/lib/server/research/threads';
import { inventoryState } from '@/lib/server/research/inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => (await getThreads()) ?? { building: true, inventory: inventoryState() });
