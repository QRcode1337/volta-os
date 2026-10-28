import { route } from '@/lib/server/route-helpers';
import { peerCard } from '@/lib/server/honcho';
import { fromHoncho, idOf, optId } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Peer card: the observer's own card, or its card about ?target=. */
export const GET = route<{ workspace: string; peer: string }>(
  ({ params, url }) => {
    const w = idOf(params.workspace, 'workspace');
    const peer = idOf(params.peer, 'peer');
    const target = optId(url.searchParams.get('target'), 'target');
    return fromHoncho(peerCard(w, peer, target));
  },
  { tag: 'honcho' },
);
