import { getDreams } from '@/lib/server/notion/dreams';
import { allowForce, notionHttp } from '@/lib/server/notion/route';
import { route } from '@/lib/server/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  async ({ req }) => ({ entries: await getDreams(5, { force: allowForce(req, 'dreams') }).catch(notionHttp) }),
  { tag: 'volta notion api' },
);
