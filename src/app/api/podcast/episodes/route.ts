import { localJson } from '@/lib/server/route-helpers';
import { listEpisodes } from '@/lib/server/podcast/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/podcast/episodes → { episodes } newest first (localhost only) */
export const GET = localJson(async () => ({ episodes: await listEpisodes() }));
