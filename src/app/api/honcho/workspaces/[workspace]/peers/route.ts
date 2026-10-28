import { intParam, route } from '@/lib/server/route-helpers';
import { listPeers } from '@/lib/server/honcho';
import { fromHoncho, idOf } from '@/app/api/honcho/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route<{ workspace: string }>(
  ({ params, url }) => {
    const w = idOf(params.workspace, 'workspace');
    const page = intParam(url, 'page', { min: 1, max: 10_000, fallback: 1 })!;
    const size = intParam(url, 'size', { min: 1, max: 100, fallback: 100 })!;
    return fromHoncho(listPeers(w, page, size));
  },
  { tag: 'honcho' },
);
