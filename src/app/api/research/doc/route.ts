// GET /api/research/doc?id=<row id or Stage A id>  Stage A fields, Stage B text, vault notes that mention it, graph concepts, related docs.
import { researchJson, notFound } from '@/lib/server/research/route';
import { getDoc } from '@/lib/server/research/doc';
import { inventoryState } from '@/lib/server/research/inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = researchJson(async (req) => {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!/^[\w.-]{1,100}$/.test(id)) return notFound('Missing or malformed id.');
  const doc = await getDoc(id);
  if (doc === undefined) return { building: true, inventory: inventoryState() };
  if (doc === null) return notFound('Unknown document (the inventory may have changed; search again).');
  return doc;
});
