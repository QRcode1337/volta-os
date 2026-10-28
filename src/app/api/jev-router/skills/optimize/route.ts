import { HttpError, route } from '@/lib/server/route-helpers';
import { cached } from '@/lib/server/sources/cache';
import { planSkillTier, skillRoutingBoard } from '@/lib/server/jev/skill-routing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COMMAND_RE = /^\/[a-z0-9][a-z0-9-]{0,47}$/;

/**
 * POST /api/jev-router/skills/optimize  { command, tier?: 'HAIKU'|'SONNET', apply?: boolean, expectMtimeMs?: number }
 * Without `apply`: a preview of the SKILL.md frontmatter change (nothing is written).
 * With `apply: true` + the preview's `expectMtimeMs`: writes it atomically; 409 if the file changed or is not writable.
 */
export const POST = route(
  async ({ body }) => {
    const { command, tier = 'HAIKU', apply, expectMtimeMs } = body;
    if (typeof command !== 'string' || !COMMAND_RE.test(command)) throw new HttpError('`command` must look like "/skill-name"', 400);
    if (tier !== 'HAIKU' && tier !== 'SONNET') throw new HttpError('`tier` must be HAIKU or SONNET', 400);
    if (apply !== true) return planSkillTier(command, tier);
    if (typeof expectMtimeMs !== 'number') throw new HttpError('`expectMtimeMs` from the preview is required to apply', 400);
    const plan = await planSkillTier(command, tier, { expectMtimeMs });
    await cached('jev:skill-routing', 30_000, skillRoutingBoard, { force: true }).catch(() => undefined); // board shows the new tier
    return { ...plan, applied: true };
  },
  { json: true, tag: 'jev optimize' },
);
