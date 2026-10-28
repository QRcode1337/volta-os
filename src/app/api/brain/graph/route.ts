import { route } from '@/lib/server/route-helpers';
import { getBrainGraph } from '@/lib/server/sources/notes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Each size is its own cached graph, so only a few sizes are allowed (the UI asks for 700).
const SIZES = [300, 700, 1500, 3000] as const;

export const GET = route(async ({ url }) => {
  const asked = Number(url.searchParams.get('max')) || 700;
  const max = SIZES.find((s) => s >= asked) ?? SIZES[SIZES.length - 1];
  return getBrainGraph(max);
});
