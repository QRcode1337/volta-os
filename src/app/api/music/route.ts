// GET /api/music[?refresh=1]  the library: tracks (with ffprobe info and notes), roots, optional roots, notes-store status.
import { route } from '@/lib/server/route-helpers';
import { getLibrary } from '@/lib/server/music';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(({ url }) => getLibrary({ refresh: url.searchParams.get('refresh') === '1' }), { tag: 'music api' });
