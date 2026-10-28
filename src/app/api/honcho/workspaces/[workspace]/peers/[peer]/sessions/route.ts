import { intParam, route } from '@/lib/server/route-helpers';
import { peerSessions } from '@/lib/server/honcho';
import { fromHoncho, idOf } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sessions a peer belongs to, newest first. */
export const GET = route<{ workspace: string; peer: string }>(
  ({ params, url }) => {
    const w = idOf(params.workspace, 'workspace');
    const peer = idOf(params.peer, 'peer');
    const page = intParam(url, 'page', { min: 1, max: 10_000, fallback: 1 })!;
    const size = intParam(url, 'size', { min: 1, max: 100, fallback: 50 })!;
    return fromHoncho(peerSessions(w, peer, page, size));
  },
  { tag: 'honcho' },
);
