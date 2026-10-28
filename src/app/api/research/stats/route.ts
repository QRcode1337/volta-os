// GET /api/research/stats  per-domain (Stage A tags) and per-folder (inventory) stats.
import { route } from '@/lib/server/route-helpers';
import { getStats } from '@/lib/server/research/stats';
import { inventoryState } from '@/lib/server/research/inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => (await getStats()) ?? { building: true, inventory: inventoryState() });
