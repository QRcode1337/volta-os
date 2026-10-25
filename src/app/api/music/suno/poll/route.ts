// GET /api/music/suno/poll?ids=<clip>,<clip>  status + audio URL per clip (proxies suno-api /api/get?ids=). Spends nothing.
import { pollClips, sunoGet } from '@/lib/server/music/suno';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = sunoGet((req) => pollClips(new URL(req.url).searchParams.get('ids')));
