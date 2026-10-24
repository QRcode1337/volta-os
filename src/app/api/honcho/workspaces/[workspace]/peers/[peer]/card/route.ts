import { peerCard } from '@/lib/server/honcho';
import { handle, idOf, json, optId, type Params } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Peer card: the observer's own card, or its card about ?target=. */
export const GET = handle(async (req: Request, { params }: Params<{ workspace: string; peer: string }>) => {
  const p = await params;
  const w = idOf(p.workspace, 'workspace');
  const peer = idOf(p.peer, 'peer');
  const target = optId(new URL(req.url).searchParams.get('target'), 'target');
  return json(await peerCard(w, peer, target));
});
