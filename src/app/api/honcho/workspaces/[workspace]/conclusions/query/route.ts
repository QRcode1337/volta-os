import { HttpError, route } from '@/lib/server/route-helpers';
import { queryConclusions } from '@/lib/server/honcho';
import { fromHoncho, idOf, textOf } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Semantic conclusion search. Body: {query, observer, observed, top_k?} */
export const POST = route<{ workspace: string }>(
  ({ params, body: b }) => {
    const w = idOf(params.workspace, 'workspace');
    const topK = b.top_k == null ? 20 : Number(b.top_k);
    if (!Number.isInteger(topK) || topK < 1 || topK > 100) throw new HttpError('invalid top_k', 400);
    return fromHoncho(
      queryConclusions(w, {
        query: textOf(b.query, 'query', 2000)!,
        observer: idOf(b.observer as string, 'observer'),
        observed: idOf(b.observed as string, 'observed'),
        topK,
      }),
    );
  },
  { json: true, maxBytes: 64 * 1024, tag: 'honcho' },
);
