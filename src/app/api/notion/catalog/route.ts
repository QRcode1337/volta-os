import { getCatalog } from '@/lib/server/notion/catalog';
import { refreshOpts, notionHttp } from '@/lib/server/notion/route';
import { route } from '@/lib/server/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(({ req }) => getCatalog(refreshOpts(req)).catch(notionHttp), { tag: 'volta notion api' });
