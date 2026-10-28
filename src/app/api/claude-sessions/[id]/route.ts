import { HttpError, route } from '@/lib/server/route-helpers';
import { getSessionDetail } from '@/lib/server/sources/sessions';
import { sessionIdOf } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/claude-sessions/<id> — metadata, token split, tool/skill counts, subagents (no transcript). */
export const GET = route<{ id: string }>(
  async ({ params }) => {
    const detail = await getSessionDetail(sessionIdOf(params.id));
    if (!detail) throw new HttpError('session not found', 404);
    return detail;
  },
  { tag: 'volta sessions' },
);
