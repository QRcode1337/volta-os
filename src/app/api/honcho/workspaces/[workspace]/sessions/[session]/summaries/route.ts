import { sessionSummaries } from '@/lib/server/honcho';
import { handle, idOf, json, type Params } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (_req: Request, { params }: Params<{ workspace: string; session: string }>) => {
  const p = await params;
  return json(await sessionSummaries(idOf(p.workspace, 'workspace'), idOf(p.session, 'session')));
});
