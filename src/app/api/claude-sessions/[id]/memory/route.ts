import { getSessionMemory } from '@/lib/server/sources/sessions';
import { sessionRoute } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/claude-sessions/<id>/memory — claude-mem observations + summaries recorded for this session. */
export const GET = sessionRoute((_req, id) => getSessionMemory(id));
