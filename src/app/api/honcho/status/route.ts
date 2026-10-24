import { health, HONCHO_URL } from '@/lib/server/honcho';
import { handle, json } from '@/app/api/honcho/_shared';
import type { HonchoStatus } from '@/types/honcho';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liveness probe. 200 {online:true,…} or 503 {error, offline:true, url}. */
export const GET = handle(async () => {
  const { latencyMs } = await health();
  const body: HonchoStatus = { online: true, url: HONCHO_URL, latencyMs };
  return json(body);
});
