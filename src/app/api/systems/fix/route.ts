import { NextResponse } from 'next/server';
import { rejectNonLocalMutation } from '@/lib/server/local-only';
import { FixError, agentHandoff, runFixCommand } from '@/lib/server/systems/fix';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_RE = /^[a-z]+:[A-Za-z0-9._-]{1,120}$|^memory$/;
const noStore = { 'Cache-Control': 'no-store' };

/**
 * POST /api/systems/fix
 *   {action:'run', id}                → FixRunResult   (runs that attention item's own documented command)
 *   {action:'agent', ids?, open?}     → AgentHandoff   (fix prompt; open=true also starts `claude` in Terminal)
 * Ids only — commands and prompts are re-derived server-side from a fresh probe.
 */
export async function POST(req: Request) {
  const denied = rejectNonLocalMutation(req);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400, headers: noStore });
  }
  try {
    if (body.action === 'run') {
      if (typeof body.id !== 'string' || !ID_RE.test(body.id)) throw new FixError(400, 'invalid id');
      return NextResponse.json(await runFixCommand(body.id), { headers: noStore });
    }
    if (body.action === 'agent') {
      const ids = body.ids === undefined ? [] : body.ids;
      if (!Array.isArray(ids) || ids.length > 50 || !ids.every((i) => typeof i === 'string' && ID_RE.test(i))) throw new FixError(400, 'invalid ids');
      return NextResponse.json(await agentHandoff(ids as string[], body.open === true), { headers: noStore });
    }
    throw new FixError(400, "`action` must be 'run' or 'agent'");
  } catch (err) {
    if (err instanceof FixError) return NextResponse.json({ error: err.message }, { status: err.status, headers: noStore });
    console.error('[volta systems/fix]', err);
    return NextResponse.json({ error: (err as Error).message || 'failed' }, { status: 500, headers: noStore });
  }
}
