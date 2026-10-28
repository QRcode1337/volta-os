import { HttpError, route } from '@/lib/server/route-helpers';
import { getFeedItem } from '@/lib/server/feeds';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/feeds/item?id=  -> the full item (markdown body, already secret-masked). */
export const GET = route(
  async ({ url }) => {
    const id = url.searchParams.get('id') ?? '';
    const item = id ? await getFeedItem(id) : null;
    if (!item) throw new HttpError('Feed item not found (it may have rolled out of the retention window).', 404);
    return item;
  },
  { tag: 'volta feeds' },
);
