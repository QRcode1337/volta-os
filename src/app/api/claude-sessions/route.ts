import { HttpError, intParam, route } from '@/lib/server/route-helpers';
import { listSessions, type SessionListQuery } from '@/lib/server/sources/sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROJECT_RE = /^[A-Za-z0-9._-]{1,255}$/;
const SORTS = new Set(['recent', 'tokens', 'longest', 'tools']);

/**
 * GET /api/claude-sessions?q=&project=&days=&automated=1&sort=recent|tokens|longest|tools&limit=&offset=
 * Projects + matching sessions from the lazily built transcript index (includes index progress).
 */
export const GET = route(
  ({ url }) => {
    const sp = url.searchParams;
    const project = sp.get('project') || undefined;
    if (project && !PROJECT_RE.test(project)) throw new HttpError('invalid project', 400);
    const sort = sp.get('sort') || 'recent';
    if (!SORTS.has(sort)) throw new HttpError('invalid sort', 400);
    const query: SessionListQuery = {
      q: (sp.get('q') ?? '').slice(0, 200),
      project,
      days: intParam(url, 'days', { min: 0, max: 3650 }) || undefined,
      automated: sp.get('automated') === '1',
      sort: sort as SessionListQuery['sort'],
      limit: intParam(url, 'limit', { min: 1, max: 200, fallback: 100 }),
      offset: intParam(url, 'offset', { min: 0, max: 100_000, fallback: 0 }),
    };
    return listSessions(query);
  },
  { tag: 'volta sessions' },
);
