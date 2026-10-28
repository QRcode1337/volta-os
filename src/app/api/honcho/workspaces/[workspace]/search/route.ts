import { HttpError, route } from '@/lib/server/route-helpers';
import { searchPeer, searchSession, searchWorkspace } from '@/lib/server/honcho';
import { fromHoncho, idOf, optId, textOf } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Hybrid message search. Body: {query, limit?, peer?, session?} → scoped to session, peer, or workspace. */
export const POST = route<{ workspace: string }>(
  ({ params, body: b }) => {
    const w = idOf(params.workspace, 'workspace');
    const query = textOf(b.query, 'query', 2000)!;
    const limit = b.limit == null ? 30 : Number(b.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError('invalid limit', 400);
    const session = optId(b.session as string | undefined, 'session');
    const peer = optId(b.peer as string | undefined, 'peer');
    if (session && peer) return fromHoncho(searchWorkspace(w, query, limit, { session_id: session, peer_id: peer }));
    if (session) return fromHoncho(searchSession(w, session, query, limit));
    if (peer) return fromHoncho(searchPeer(w, peer, query, limit));
    return fromHoncho(searchWorkspace(w, query, limit));
  },
  { json: true, maxBytes: 64 * 1024, tag: 'honcho' },
);
