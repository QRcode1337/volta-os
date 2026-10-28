import { route } from '@/lib/server/route-helpers';
import { sessionPeers } from '@/lib/server/honcho';
import { fromHoncho, idOf } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route<{ workspace: string; session: string }>(
  ({ params: p }) => fromHoncho(sessionPeers(idOf(p.workspace, 'workspace'), idOf(p.session, 'session'))),
  { tag: 'honcho' },
);
