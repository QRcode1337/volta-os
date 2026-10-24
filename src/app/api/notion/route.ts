import { localJson } from '@/lib/server/route-helpers';
import { getNotionPages } from '@/lib/server/sources/notion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = localJson(async () => ({ pages: await getNotionPages(12) }));
