import { getMessage } from '@/lib/server/honcho';
import { handle, idOf, json, type Params } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One message (masked like every proxied body). Used by /apps/honcho deep links that carry only a message id. */
export const GET = handle(async (_req: Request, { params }: Params<{ workspace: string; session: string; message: string }>) => {
  const p = await params;
  return json(await getMessage(idOf(p.workspace, 'workspace'), idOf(p.session, 'session'), idOf(p.message, 'message')));
});
