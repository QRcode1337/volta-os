import { listSessions } from '@/lib/server/honcho';
import { handle, idOf, intOf, json, type Params } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Workspace sessions, newest first. */
export const GET = handle(async (req: Request, { params }: Params<{ workspace: string }>) => {
  const w = idOf((await params).workspace, 'workspace');
  const sp = new URL(req.url).searchParams;
  const page = intOf(sp.get('page'), 'page', 1, 1, 10_000);
  const size = intOf(sp.get('size'), 'size', 50, 1, 100);
  return json(await listSessions(w, page, size));
});
