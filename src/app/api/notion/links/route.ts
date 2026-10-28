import { route } from '@/lib/server/route-helpers';
import { getNotionLinks } from '@/lib/server/notion/links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => ({ links: await getNotionLinks() }));
