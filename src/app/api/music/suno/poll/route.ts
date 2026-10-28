// GET /api/music/suno/poll?ids=<clip>,<clip>  status + audio URL per clip (proxies suno-api /api/get?ids=). Spends nothing.
import { route } from '@/lib/server/route-helpers';
import { pollClips } from '@/lib/server/music/suno';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = route(({ url }) => pollClips(url.searchParams.get('ids')), { tag: 'music api' });
