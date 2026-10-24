import { workspaceStats } from '@/lib/server/honcho';
import { handle, idOf, json, type Params } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Per-peer session/message counts and per-session message totals. Cached per workspace for 10 min;
 * `?fresh=1` joins a run in flight and is honoured at most once a minute (see workspaceStats).
 */
export const GET = handle(async (req: Request, { params }: Params<{ workspace: string }>) => {
  const w = idOf((await params).workspace, 'workspace');
  const fresh = new URL(req.url).searchParams.get('fresh') === '1';
  return json(await workspaceStats(w, fresh));
});
