import { route } from '@/lib/server/route-helpers';
import { getSessionMemory } from '@/lib/server/sources/sessions';
import { sessionIdOf } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/claude-sessions/<id>/memory — claude-mem observations + summaries recorded for this session. */
export const GET = route<{ id: string }>(({ params }) => getSessionMemory(sessionIdOf(params.id)), { tag: 'volta sessions' });
