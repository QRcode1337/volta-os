import { getCatalog } from '@/lib/server/notion/catalog';
import { allowForce, notionHttp } from '@/lib/server/notion/route';
import { route } from '@/lib/server/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(({ req }) => getCatalog({ force: allowForce(req, 'catalog') }).catch(notionHttp), { tag: 'volta notion api' });
