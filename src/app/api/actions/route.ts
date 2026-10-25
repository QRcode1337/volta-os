// GET /api/actions[?counts=1][&refresh=1]
//   -> { available, source, counts: {total, byStatus, byAgent, bySection}, items[], generatedAt }
//   counts=1 omits items (used by the dashboard AwaitingBadge). Read-only: VOLTA never writes actions.md.
import { localJson } from '@/lib/server/route-helpers';
import { getActions } from '@/lib/server/sources/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = localJson((req) => {
  const q = new URL(req.url).searchParams;
  return getActions({ refresh: q.get('refresh') === '1', countsOnly: q.get('counts') === '1' });
});
