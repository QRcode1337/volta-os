import { sessionMessages } from '@/lib/server/honcho';
import { BadRequest, handle, idOf, intOf, isoOf, json, optId, type Params } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Messages in a session. ?order=asc|desc, windowed by created_at:
 * ?before= (lt), ?after= (gt), ?from= (gte); optional ?peer= sender filter.
 */
export const GET = handle(async (req: Request, { params }: Params<{ workspace: string; session: string }>) => {
  const p = await params;
  const w = idOf(p.workspace, 'workspace');
  const s = idOf(p.session, 'session');
  const sp = new URL(req.url).searchParams;
  const order = sp.get('order') ?? 'desc';
  if (order !== 'asc' && order !== 'desc') throw new BadRequest('invalid order');
  return json(
    await sessionMessages(w, s, {
      order,
      before: isoOf(sp.get('before'), 'before'),
      after: isoOf(sp.get('after'), 'after'),
      from: isoOf(sp.get('from'), 'from'),
      peer: optId(sp.get('peer'), 'peer'),
      page: intOf(sp.get('page'), 'page', 1, 1, 10_000),
      size: intOf(sp.get('size'), 'size', 50, 1, 100),
    }),
  );
});
