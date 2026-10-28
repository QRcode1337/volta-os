// GET /api/actions[?counts=1][&refresh=1]
//   -> { available, source, counts: {total, byStatus, byAgent, bySection}, items[], generatedAt }
//   counts=1 omits items (used by the dashboard AwaitingBadge).
import { NextResponse } from 'next/server';
import { rejectNonLocalMutation } from '@/lib/server/local-only';
import { localJson } from '@/lib/server/route-helpers';
import { getActions } from '@/lib/server/sources/actions';
import { ActionWriteError, actionAgentHandoff, addActionNote, setActionStatus } from '@/lib/server/sources/actions-write';
import { ACTION_STATUSES, type ActionStatus } from '@/components/tasks/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_RE = /^act_[0-9a-f]{10}(-\d+)?$/;
const noStore = { 'Cache-Control': 'no-store' };

export const GET = localJson((req) => {
  const q = new URL(req.url).searchParams;
  return getActions({ refresh: q.get('refresh') === '1', countsOnly: q.get('counts') === '1' });
});

/**
 * POST /api/actions — act on one item (ids only; the item is re-read from actions.md server-side).
 *   {action:'status', id, line?, status} → {ok}      flip the [marker] and bump the date
 *   {action:'note',   id, line?, note}   → {ok}      add "  - Patrick (date): note" under the item
 *   {action:'agent',  id, line?, open?}  → {prompt, opened, error}   Claude Code prompt; open=true starts it in Terminal
 */
export async function POST(req: Request) {
  const denied = rejectNonLocalMutation(req);
  if (denied) return denied;
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400, headers: noStore });
  }
  try {
    if (typeof b.id !== 'string' || !ID_RE.test(b.id)) throw new ActionWriteError(400, 'invalid id');
    const line = Number.isInteger(b.line) ? (b.line as number) : undefined;
    if (b.action === 'status') {
      if (!(ACTION_STATUSES as readonly unknown[]).includes(b.status)) throw new ActionWriteError(400, 'invalid status');
      return NextResponse.json(await setActionStatus(b.id, line, b.status as ActionStatus), { headers: noStore });
    }
    if (b.action === 'note') {
      if (typeof b.note !== 'string') throw new ActionWriteError(400, 'note must be text');
      return NextResponse.json(await addActionNote(b.id, line, b.note), { headers: noStore });
    }
    if (b.action === 'agent') return NextResponse.json(await actionAgentHandoff(b.id, line, b.open === true), { headers: noStore });
    throw new ActionWriteError(400, "`action` must be 'status', 'note' or 'agent'");
  } catch (err) {
    if (err instanceof ActionWriteError) return NextResponse.json({ error: err.message }, { status: err.status, headers: noStore });
    console.error('[volta actions POST]', err);
    return NextResponse.json({ error: (err as Error).message || 'failed' }, { status: 500, headers: noStore });
  }
}
