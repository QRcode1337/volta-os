import { peerChat, workspaceChat } from '@/lib/server/honcho';
import { BadRequest, handle, idOf, json, optId, readBody, textOf, type Params } from '@/app/api/honcho/_shared';
import { HONCHO_REASONING_LEVELS, type HonchoChatResponse, type HonchoReasoningLevel } from '@/types/honcho';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const maxDuration = 200;

/**
 * Dialectic chat ("Ask Honcho"). Body: {query, peer?, target?, session?, reasoning_level?}.
 * With peer → peer chat (optionally about target); without → workspace chat.
 * Aborting the browser request aborts the upstream call.
 */
export const POST = handle(async (req: Request, { params }: Params<{ workspace: string }>) => {
  const w = idOf((await params).workspace, 'workspace');
  const b = await readBody(req);
  const query = textOf(b.query, 'query', 10_000)!;
  const peer = optId(b.peer as string | undefined, 'peer');
  const target = optId(b.target as string | undefined, 'target');
  const session = optId(b.session as string | undefined, 'session');
  const level = (b.reasoning_level ?? 'low') as HonchoReasoningLevel;
  if (!HONCHO_REASONING_LEVELS.includes(level)) throw new BadRequest('invalid reasoning_level');
  if (target && !peer) throw new BadRequest('target requires peer');

  const t0 = performance.now();
  const res = peer
    ? await peerChat(w, peer, { query, target, session, reasoning_level: level, signal: req.signal })
    : await workspaceChat(w, { query, session, reasoning_level: level, signal: req.signal });
  const body: HonchoChatResponse = { content: res.content, mode: peer ? 'peer' : 'workspace', elapsedMs: Math.round(performance.now() - t0) };
  return json(body);
});
