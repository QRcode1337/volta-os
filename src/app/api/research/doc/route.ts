// GET /api/research/doc?id=<row id or Stage A id>  Stage A fields, Stage B text, vault notes that mention it, graph concepts, related docs.
import { HttpError, route } from '@/lib/server/route-helpers';
import { getDoc } from '@/lib/server/research/doc';
import { inventoryState } from '@/lib/server/research/inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  async ({ url }) => {
    const id = url.searchParams.get('id') ?? '';
    if (!/^[\w.-]{1,100}$/.test(id)) throw new HttpError('Missing or malformed id.', 404);
    const doc = await getDoc(id);
    if (doc === undefined) return { building: true, inventory: inventoryState() };
    if (doc === null) throw new HttpError('Unknown document (the inventory may have changed; search again).', 404);
    return doc;
  },
  { tag: 'research api' },
);
