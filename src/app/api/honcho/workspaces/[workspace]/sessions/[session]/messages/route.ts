import { HttpError, intParam, route } from '@/lib/server/route-helpers';
import { sessionMessages } from '@/lib/server/honcho';
import { fromHoncho, idOf, isoOf, optId } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Messages in a session. ?order=asc|desc, windowed by created_at:
 * ?before= (lt), ?after= (gt), ?from= (gte); optional ?peer= sender filter.
 */
export const GET = route<{ workspace: string; session: string }>(
  ({ params, url }) => {
    const w = idOf(params.workspace, 'workspace');
    const s = idOf(params.session, 'session');
    const sp = url.searchParams;
    const order = sp.get('order') ?? 'desc';
    if (order !== 'asc' && order !== 'desc') throw new HttpError('invalid order', 400);
    return fromHoncho(
      sessionMessages(w, s, {
        order,
        before: isoOf(sp.get('before'), 'before'),
        after: isoOf(sp.get('after'), 'after'),
        from: isoOf(sp.get('from'), 'from'),
        peer: optId(sp.get('peer'), 'peer'),
        page: intParam(url, 'page', { min: 1, max: 10_000, fallback: 1 })!,
        size: intParam(url, 'size', { min: 1, max: 100, fallback: 50 })!,
      }),
    );
  },
  { tag: 'honcho' },
);
