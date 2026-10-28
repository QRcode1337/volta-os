import { intParam, route } from '@/lib/server/route-helpers';
import { listSessions } from '@/lib/server/honcho';
import { fromHoncho, idOf } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Workspace sessions, newest first. */
export const GET = route<{ workspace: string }>(
  ({ params, url }) => {
    const w = idOf(params.workspace, 'workspace');
    const page = intParam(url, 'page', { min: 1, max: 10_000, fallback: 1 })!;
    const size = intParam(url, 'size', { min: 1, max: 100, fallback: 50 })!;
    return fromHoncho(listSessions(w, page, size));
  },
  { tag: 'honcho' },
);
