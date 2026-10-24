import { queryConclusions } from '@/lib/server/honcho';
import { BadRequest, handle, idOf, json, readBody, textOf, type Params } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Semantic conclusion search. Body: {query, observer, observed, top_k?} */
export const POST = handle(async (req: Request, { params }: Params<{ workspace: string }>) => {
  const w = idOf((await params).workspace, 'workspace');
  const b = await readBody(req);
  const topK = b.top_k == null ? 20 : Number(b.top_k);
  if (!Number.isInteger(topK) || topK < 1 || topK > 100) throw new BadRequest('invalid top_k');
  return json(
    await queryConclusions(w, {
      query: textOf(b.query, 'query', 2000)!,
      observer: idOf(b.observer as string, 'observer'),
      observed: idOf(b.observed as string, 'observed'),
      topK,
    }),
  );
});
