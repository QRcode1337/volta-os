import { route } from '@/lib/server/route-helpers';
import { deriverMetrics, queueStatus } from '@/lib/server/honcho';
import { fromHoncho, idOf, optId } from '@/app/api/honcho/_shared';
import type { HonchoQueueResponse } from '@/types/honcho';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Deriver queue for the workspace (optionally one session) + global deriver metrics. */
export const GET = route<{ workspace: string }>(
  async ({ params, url }) => {
    const w = idOf(params.workspace, 'workspace');
    const session = optId(url.searchParams.get('session'), 'session');
    const [queue, deriver] = await fromHoncho(Promise.all([queueStatus(w, { session }), deriverMetrics()]));
    const body: HonchoQueueResponse = { queue, deriver };
    return body;
  },
  { tag: 'honcho' },
);
