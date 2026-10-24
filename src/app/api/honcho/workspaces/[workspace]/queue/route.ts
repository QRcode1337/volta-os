import { deriverMetrics, queueStatus } from '@/lib/server/honcho';
import { handle, idOf, json, optId, type Params } from '@/app/api/honcho/_shared';
import type { HonchoQueueResponse } from '@/types/honcho';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Deriver queue for the workspace (optionally one session) + global deriver metrics. */
export const GET = handle(async (req: Request, { params }: Params<{ workspace: string }>) => {
  const w = idOf((await params).workspace, 'workspace');
  const session = optId(new URL(req.url).searchParams.get('session'), 'session');
  const [queue, deriver] = await Promise.all([queueStatus(w, { session }), deriverMetrics()]);
  const body: HonchoQueueResponse = { queue, deriver };
  return json(body);
});
