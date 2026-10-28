import { route } from '@/lib/server/route-helpers';
import { cached } from '@/lib/server/sources/cache';
import { ROUTING_LOG_PATH, skillRoutingBoard } from '@/lib/server/jev/skill-routing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/jev-router/skills[?refresh=1] → per-skill JEV routing history (Skills "JEV ROUTED" leaderboard).
 * Reads the append-only log only; never calls JEV. Reloads when the log changes.
 */
export const GET = route(async ({ url }) =>
  cached('jev:skill-routing', 30_000, skillRoutingBoard, { mtimeOf: [ROUTING_LOG_PATH], force: url.searchParams.get('refresh') === '1', minForceMs: 2_000 }),
);
