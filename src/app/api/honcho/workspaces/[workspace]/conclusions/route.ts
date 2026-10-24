import { listConclusions } from '@/lib/server/honcho';
import { BadRequest, handle, idOf, intOf, json, optId, type Params } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LEVELS = new Set(['explicit', 'deductive', 'inductive', 'contradiction']);

/** Conclusions, newest first. Filters: ?observer= ?observed= ?session= ?level= */
export const GET = handle(async (req: Request, { params }: Params<{ workspace: string }>) => {
  const w = idOf((await params).workspace, 'workspace');
  const sp = new URL(req.url).searchParams;
  const level = sp.get('level') || undefined;
  if (level && !LEVELS.has(level)) throw new BadRequest('invalid level');
  return json(
    await listConclusions(
      w,
      {
        observer: optId(sp.get('observer'), 'observer'),
        observed: optId(sp.get('observed'), 'observed'),
        session: optId(sp.get('session'), 'session'),
        level,
      },
      intOf(sp.get('page'), 'page', 1, 1, 10_000),
      intOf(sp.get('size'), 'size', 50, 1, 100),
    ),
  );
});
