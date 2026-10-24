import { listWorkspaces } from '@/lib/server/honcho';
import { handle, intOf, json } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const page = intOf(sp.get('page'), 'page', 1, 1, 10_000);
  return json(await listWorkspaces(page, 100));
});
