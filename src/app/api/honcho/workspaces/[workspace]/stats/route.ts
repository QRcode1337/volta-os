import { route } from '@/lib/server/route-helpers';
import { workspaceStats } from '@/lib/server/honcho';
import { fromHoncho, idOf } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Per-peer session/message counts and per-session message totals. Cached per workspace for 10 min;
 * `?fresh=1` joins a run in flight and is honoured at most once a minute (see workspaceStats).
 */
export const GET = route<{ workspace: string }>(
  ({ params, url }) => fromHoncho(workspaceStats(idOf(params.workspace, 'workspace'), url.searchParams.get('fresh') === '1')),
  { tag: 'honcho' },
);
