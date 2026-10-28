// GET /api/research/graph?source=voltamachine|uap&max=450&edges=900&community=<id>  graphify nodes, edges and communities, capped and sampled for the browser.
import { route } from '@/lib/server/route-helpers';
import { sampleGraph } from '@/lib/server/research/graphs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  ({ url }) => {
    const p = url.searchParams;
    const num = (k: string) => (p.get(k) !== null && p.get(k) !== '' && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : undefined);
    return sampleGraph(p.get('source') ?? 'voltamachine', { maxNodes: num('max'), maxEdges: num('edges'), community: num('community') ?? null });
  },
  { tag: 'research api', redact: true },
);
