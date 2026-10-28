import { route } from '@/lib/server/route-helpers';
import { getRecentNotes } from '@/lib/server/sources/notes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async ({ url }) => {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 36, 1), 200);
  return { notes: await getRecentNotes(limit) };
});
