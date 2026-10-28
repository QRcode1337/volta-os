import { HttpError, route } from '@/lib/server/route-helpers';
import { agentHandoff, runFixCommand } from '@/lib/server/systems/fix';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_RE = /^[a-z]+:[A-Za-z0-9._-]{1,120}$|^memory$/;

/**
 * POST /api/systems/fix
 *   {action:'run', id}                → FixRunResult   (runs that attention item's own documented command)
 *   {action:'agent', ids?, open?}     → AgentHandoff   (fix prompt; open=true also starts `claude` in Terminal)
 * Ids only — commands and prompts are re-derived server-side from a fresh probe.
 */
export const POST = route(
  ({ body }) => {
    if (body.action === 'run') {
      if (typeof body.id !== 'string' || !ID_RE.test(body.id)) throw new HttpError('invalid id', 400);
      return runFixCommand(body.id);
    }
    if (body.action === 'agent') {
      const ids = body.ids === undefined ? [] : body.ids;
      if (!Array.isArray(ids) || ids.length > 50 || !ids.every((i) => typeof i === 'string' && ID_RE.test(i))) throw new HttpError('invalid ids', 400);
      return agentHandoff(ids as string[], body.open === true);
    }
    throw new HttpError("`action` must be 'run' or 'agent'", 400);
  },
  { json: true, tag: 'volta systems/fix' },
);
