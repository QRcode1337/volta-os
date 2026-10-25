// GET /api/research/synthesis?id=v:<file stem>|e:<file stem>  one synthesis as cleaned markdown (leaked "Thinking..." removed, secrets masked).
import { researchJson, notFound } from '@/lib/server/research/route';
import { getSynthesis } from '@/lib/server/research/vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = researchJson(async (req) => {
  const s = await getSynthesis(new URL(req.url).searchParams.get('id') ?? '');
  return s ?? notFound('Unknown synthesis.');
});
