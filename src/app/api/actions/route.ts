// GET /api/actions[?counts=1][&refresh=1]
//   -> { available, source, counts: {total, byStatus, byAgent, bySection}, items[], generatedAt }
//   counts=1 omits items (used by the dashboard AwaitingBadge).
import { HttpError, route } from '@/lib/server/route-helpers';
import { getActions } from '@/lib/server/sources/actions';
import { actionAgentHandoff, addActionNote, setActionStatus } from '@/lib/server/sources/actions-write';
import { ACTION_STATUSES, type ActionStatus } from '@/components/tasks/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_RE = /^act_[0-9a-f]{10}(-\d+)?$/;

export const GET = route(({ url }) => {
  const q = url.searchParams;
  return getActions({ refresh: q.get('refresh') === '1', countsOnly: q.get('counts') === '1' });
});

/**
 * POST /api/actions — act on one item (ids only; the item is re-read from actions.md server-side).
 *   {action:'status', id, line?, status} → {ok}      flip the [marker] and bump the date
 *   {action:'note',   id, line?, note}   → {ok}      add "  - Patrick (date): note" under the item
 *   {action:'agent',  id, line?, open?}  → {prompt, opened, error}   Claude Code prompt; open=true starts it in Terminal
 */
export const POST = route(
  async ({ body: b }) => {
    if (typeof b.id !== 'string' || !ID_RE.test(b.id)) throw new HttpError('invalid id', 400);
    const line = Number.isInteger(b.line) ? (b.line as number) : undefined;
    if (b.action === 'status') {
      if (!(ACTION_STATUSES as readonly unknown[]).includes(b.status)) throw new HttpError('invalid status', 400);
      return setActionStatus(b.id, line, b.status as ActionStatus);
    }
    if (b.action === 'note') {
      if (typeof b.note !== 'string') throw new HttpError('note must be text', 400);
      return addActionNote(b.id, line, b.note);
    }
    if (b.action === 'agent') return actionAgentHandoff(b.id, line, b.open === true);
    throw new HttpError("`action` must be 'status', 'note' or 'agent'", 400);
  },
  { json: true, tag: 'volta actions POST' },
);
