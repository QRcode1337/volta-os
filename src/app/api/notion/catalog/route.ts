import { getCatalog } from '@/lib/server/notion/catalog';
import { allowForce, notionJson } from '@/lib/server/notion/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = notionJson((req) => getCatalog({ force: allowForce(req, 'catalog') }));
