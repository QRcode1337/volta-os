import { getDreams } from '@/lib/server/notion/dreams';
import { allowForce, notionJson } from '@/lib/server/notion/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = notionJson(async (req) => ({ entries: await getDreams(5, { force: allowForce(req, 'dreams') }) }));
