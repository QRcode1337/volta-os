import { HttpError, intParam, route } from '@/lib/server/route-helpers';
import { getTranscriptPage, SESSION_ID_RE } from '@/lib/server/sources/sessions';
import { sessionIdOf } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/claude-sessions/<id>/transcript?offset=0&limit=120&agent=<agentId>
 * A page of the readable transcript (offset=-1 → last page). Tool calls are compact rows with their
 * (truncated) results attached; secrets are masked.
 */
export const GET = route<{ id: string }>(
  async ({ params, url }) => {
    const id = sessionIdOf(params.id);
    const agent = url.searchParams.get('agent') || null;
    if (agent && !SESSION_ID_RE.test(agent)) throw new HttpError('invalid agent', 400);
    const page = await getTranscriptPage(id, {
      agentId: agent,
      offset: intParam(url, 'offset', { min: -1, max: 1_000_000, fallback: 0 }),
      limit: intParam(url, 'limit', { min: 1, max: 400, fallback: 120 }),
    });
    if (!page) throw new HttpError('session not found', 404);
    return page;
  },
  { tag: 'volta sessions' },
);
