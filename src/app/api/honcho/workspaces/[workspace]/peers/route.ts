import { listPeers } from '@/lib/server/honcho';
import { handle, idOf, intOf, json, type Params } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request, { params }: Params<{ workspace: string }>) => {
  const w = idOf((await params).workspace, 'workspace');
  const sp = new URL(req.url).searchParams;
  const page = intOf(sp.get('page'), 'page', 1, 1, 10_000);
  const size = intOf(sp.get('size'), 'size', 100, 1, 100);
  return json(await listPeers(w, page, size));
});
