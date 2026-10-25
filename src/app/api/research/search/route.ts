// GET /api/research/search?q=&root=&folder=&kind=&storage=local|icloud|external&tag=&minNovelty=&escalate=1&contradiction=1&indexed=1&sort=&limit=&offset=&rerank=1
// Ranked inventory search (filename / title / tags / summary) joined to Stage A. The first call after a restart may answer
// {building:true} while the inventory is built in the background.
import { localJson } from '@/lib/server/route-helpers';
import { parseParams, search } from '@/lib/server/research/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = localJson((req) => search(parseParams(new URL(req.url))));
