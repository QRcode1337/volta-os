import { route } from '@/lib/server/route-helpers';
import { peerRepresentation } from '@/lib/server/honcho';
import { fromHoncho, idOf, optId, textOf } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read-only view of a peer's representation (Honcho exposes it as POST; we expose GET). */
export const GET = route<{ workspace: string; peer: string }>(
  ({ params, url }) => {
    const w = idOf(params.workspace, 'workspace');
    const peer = idOf(params.peer, 'peer');
    const sp = url.searchParams;
    return fromHoncho(
      peerRepresentation(w, peer, {
        target: optId(sp.get('target'), 'target'),
        session: optId(sp.get('session'), 'session'),
        searchQuery: textOf(sp.get('q'), 'q', 500, false),
      }),
    );
  },
  { tag: 'honcho' },
);
