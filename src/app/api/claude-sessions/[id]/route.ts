import { getSessionDetail } from '@/lib/server/sources/sessions';
import { sessionRoute } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/claude-sessions/<id> — metadata, token split, tool/skill counts, subagents (no transcript). */
export const GET = sessionRoute((_req, id) => getSessionDetail(id));
