import { route } from '@/lib/server/route-helpers';
import { health, HONCHO_URL } from '@/lib/server/honcho';
import { fromHoncho } from '@/app/api/honcho/_shared';
import type { HonchoStatus } from '@/types/honcho';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liveness probe. 200 {online:true,…} or 503 {error, offline:true, url}. */
export const GET = route(
  async () => {
    const { latencyMs } = await fromHoncho(health());
    const body: HonchoStatus = { online: true, url: HONCHO_URL, latencyMs };
    return body;
  },
  { tag: 'honcho' },
);
