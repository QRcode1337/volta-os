// GET /api/media/items — the real gallery: manifest rows, newest first.
import { localJson } from '@/lib/server/route-helpers';
import { listItems } from '@/lib/server/media/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = localJson(async () => ({ items: await listItems(300) }));
