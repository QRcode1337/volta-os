// GET  /api/research/phase2                  Phase 2 status (embedder, index, clusters, job progress).
// GET  /api/research/phase2?view=threads     embedding clusters with their member docs (null until built).
// GET  /api/research/phase2?related=<rowId>  the nearest documents to one row.
// POST /api/research/phase2 {action:"build"|"label", limit?}  start a (re)build or only the cluster-naming pass, in the background (limit caps new PDF abstracts this run, for a pilot).
import { HttpError, route } from '@/lib/server/route-helpers';
import { phase2Status, related, semanticThreads, startPhase2 } from '@/lib/server/research/phase2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  async ({ url }) => {
    const rel = url.searchParams.get('related');
    if (rel) return related(rel, Math.min(30, Math.max(1, Number(url.searchParams.get('n')) || 12)));
    if (url.searchParams.get('view') === 'threads') return { threads: await semanticThreads() };
    return phase2Status();
  },
  { redact: true },
);

export const POST = route(
  ({ body }) => {
    if (body.action !== 'build' && body.action !== 'label') throw new HttpError('action must be "build" or "label".', 400);
    return startPhase2(body.action, Math.max(0, Math.floor(Number(body.limit) || 0)));
  },
  { json: true, tag: 'research phase2' },
);
