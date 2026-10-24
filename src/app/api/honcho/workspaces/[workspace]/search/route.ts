import { searchPeer, searchSession, searchWorkspace } from '@/lib/server/honcho';
import { BadRequest, handle, idOf, json, optId, readBody, textOf, type Params } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Hybrid message search. Body: {query, limit?, peer?, session?} → scoped to session, peer, or workspace. */
export const POST = handle(async (req: Request, { params }: Params<{ workspace: string }>) => {
  const w = idOf((await params).workspace, 'workspace');
  const b = await readBody(req);
  const query = textOf(b.query, 'query', 2000)!;
  const limit = b.limit == null ? 30 : Number(b.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequest('invalid limit');
  const session = optId(b.session as string | undefined, 'session');
  const peer = optId(b.peer as string | undefined, 'peer');
  if (session && peer) return json(await searchWorkspace(w, query, limit, { session_id: session, peer_id: peer }));
  if (session) return json(await searchSession(w, session, query, limit));
  if (peer) return json(await searchPeer(w, peer, query, limit));
  return json(await searchWorkspace(w, query, limit));
});
