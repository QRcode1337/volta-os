import { getPage } from '@/lib/server/notion/pages';
import { allowForce, BadRequest, notionJson } from '@/lib/server/notion/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = notionJson(async (req) => {
  const id = (new URL(req.url).searchParams.get('id') ?? '').replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) throw new BadRequest('id must be a 32-character Notion page id.');
  return getPage(id, { force: allowForce(req, id) });
});
