import { HttpError, intParam, route } from '@/lib/server/route-helpers';
import { listConclusions } from '@/lib/server/honcho';
import { fromHoncho, idOf, optId } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LEVELS = new Set(['explicit', 'deductive', 'inductive', 'contradiction']);

/** Conclusions, newest first. Filters: ?observer= ?observed= ?session= ?level= */
export const GET = route<{ workspace: string }>(
  ({ params, url }) => {
    const w = idOf(params.workspace, 'workspace');
    const sp = url.searchParams;
    const level = sp.get('level') || undefined;
    if (level && !LEVELS.has(level)) throw new HttpError('invalid level', 400);
    return fromHoncho(
      listConclusions(
        w,
        {
          observer: optId(sp.get('observer'), 'observer'),
          observed: optId(sp.get('observed'), 'observed'),
          session: optId(sp.get('session'), 'session'),
          level,
        },
        intParam(url, 'page', { min: 1, max: 10_000, fallback: 1 })!,
        intParam(url, 'size', { min: 1, max: 100, fallback: 50 })!,
      ),
    );
  },
  { tag: 'honcho' },
);
