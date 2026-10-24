import { localJson } from '@/lib/server/route-helpers';
import { MAX_LIMIT, parseSources, search, warmSearch } from '@/lib/server/search';
import { MAX_QUERY_CHARS } from '@/lib/server/search/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/search?q=text&sources=ltm,notes,claude-mem,honcho,notion,skills,routines,mcp&limit=8
// Read-only fan-out across every memory source (see src/lib/server/search). An empty q only warms the lazy
// indexes (notes, skills) and returns no results — the palette calls it when it opens.
export const GET = localJson(async (req) => {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get('q') ?? '').slice(0, MAX_QUERY_CHARS * 2);
  if (!q.trim()) return { ...warmSearch(), sources: [] };
  const limit = Number(sp.get('limit') ?? 8);
  return search({ q, sources: parseSources(sp.get('sources')), limit: Number.isFinite(limit) ? Math.min(limit, MAX_LIMIT) : 8, signal: req.signal });
});
