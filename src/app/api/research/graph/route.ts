// GET /api/research/graph?source=voltamachine|uap&max=450&edges=900&community=<id>  graphify nodes, edges and communities, capped and sampled for the browser.
import { researchJson } from '@/lib/server/research/route';
import { sampleGraph } from '@/lib/server/research/graphs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = researchJson((req) => {
  const p = new URL(req.url).searchParams;
  const num = (k: string) => (p.get(k) !== null && p.get(k) !== '' && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : undefined);
  return sampleGraph(p.get('source') ?? 'voltamachine', { maxNodes: num('max'), maxEdges: num('edges'), community: num('community') ?? null });
});
