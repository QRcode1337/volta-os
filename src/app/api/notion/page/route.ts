import { getPage } from '@/lib/server/notion/pages';
import { refreshOpts, notionHttp } from '@/lib/server/notion/route';
import { HttpError, route } from '@/lib/server/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  ({ req, url }) => {
    const id = (url.searchParams.get('id') ?? '').replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(id)) throw new HttpError('id must be a 32-character Notion page id.', 400);
    return getPage(id, refreshOpts(req)).catch(notionHttp);
  },
  { tag: 'volta notion api' },
);
