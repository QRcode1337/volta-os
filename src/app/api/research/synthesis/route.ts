// GET /api/research/synthesis?id=v:<file stem>|e:<file stem>  one synthesis as cleaned markdown (leaked "Thinking..." removed, secrets masked).
import { HttpError, route } from '@/lib/server/route-helpers';
import { getSynthesis } from '@/lib/server/research/vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  async ({ url }) => {
    const s = await getSynthesis(url.searchParams.get('id') ?? '');
    if (!s) throw new HttpError('Unknown synthesis.', 404);
    return s;
  },
  { tag: 'research api', redact: true },
);
