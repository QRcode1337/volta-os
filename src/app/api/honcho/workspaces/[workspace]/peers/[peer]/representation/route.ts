import { peerRepresentation } from '@/lib/server/honcho';
import { handle, idOf, json, optId, textOf, type Params } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read-only view of a peer's representation (Honcho exposes it as POST; we expose GET). */
export const GET = handle(async (req: Request, { params }: Params<{ workspace: string; peer: string }>) => {
  const p = await params;
  const w = idOf(p.workspace, 'workspace');
  const peer = idOf(p.peer, 'peer');
  const sp = new URL(req.url).searchParams;
  return json(
    await peerRepresentation(w, peer, {
      target: optId(sp.get('target'), 'target'),
      session: optId(sp.get('session'), 'session'),
      searchQuery: textOf(sp.get('q'), 'q', 500, false),
    }),
  );
});
