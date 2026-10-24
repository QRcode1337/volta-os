import { listSessions, type SessionListQuery } from '@/lib/server/sources/sessions';
import { BadRequest, intParam, privateRoute } from './_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROJECT_RE = /^[A-Za-z0-9._-]{1,255}$/;
const SORTS = new Set(['recent', 'tokens', 'longest', 'tools']);

/**
 * GET /api/claude-sessions?q=&project=&days=&automated=1&sort=recent|tokens|longest|tools&limit=&offset=
 * Projects + matching sessions from the lazily built transcript index (includes index progress).
 */
export const GET = privateRoute(async (req) => {
  const sp = new URL(req.url).searchParams;
  const project = sp.get('project') || undefined;
  if (project && !PROJECT_RE.test(project)) throw new BadRequest('invalid project');
  const sort = sp.get('sort') || 'recent';
  if (!SORTS.has(sort)) throw new BadRequest('invalid sort');
  const query: SessionListQuery = {
    q: (sp.get('q') ?? '').slice(0, 200),
    project,
    days: intParam(sp.get('days'), 'days', 0, 0, 3650) || undefined,
    automated: sp.get('automated') === '1',
    sort: sort as SessionListQuery['sort'],
    limit: intParam(sp.get('limit'), 'limit', 100, 1, 200),
    offset: intParam(sp.get('offset'), 'offset', 0, 0, 100_000),
  };
  return listSessions(query);
});
