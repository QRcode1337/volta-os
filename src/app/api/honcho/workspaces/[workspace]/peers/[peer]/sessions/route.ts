import { peerSessions } from '@/lib/server/honcho';
import { handle, idOf, intOf, json, type Params } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sessions a peer belongs to, newest first. */
export const GET = handle(async (req: Request, { params }: Params<{ workspace: string; peer: string }>) => {
  const p = await params;
  const w = idOf(p.workspace, 'workspace');
  const peer = idOf(p.peer, 'peer');
  const sp = new URL(req.url).searchParams;
  const page = intOf(sp.get('page'), 'page', 1, 1, 10_000);
  const size = intOf(sp.get('size'), 'size', 50, 1, 100);
  return json(await peerSessions(w, peer, page, size));
});
