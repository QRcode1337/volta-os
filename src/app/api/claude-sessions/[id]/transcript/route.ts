import { getTranscriptPage, SESSION_ID_RE } from '@/lib/server/sources/sessions';
import { BadRequest, intParam, sessionRoute } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/claude-sessions/<id>/transcript?offset=0&limit=120&agent=<agentId>
 * A page of the readable transcript (offset=-1 → last page). Tool calls are compact rows with their
 * (truncated) results attached; secrets are masked.
 */
export const GET = sessionRoute((req, id) => {
  const sp = new URL(req.url).searchParams;
  const agent = sp.get('agent') || null;
  if (agent && !SESSION_ID_RE.test(agent)) throw new BadRequest('invalid agent');
  return getTranscriptPage(id, {
    agentId: agent,
    offset: intParam(sp.get('offset'), 'offset', 0, -1, 1_000_000),
    limit: intParam(sp.get('limit'), 'limit', 120, 1, 400),
  });
});
