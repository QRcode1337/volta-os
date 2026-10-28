// GET /api/music/suno/status  is the local Suno service reachable and configured? Credits left, or the exact setup step missing.
// Never returns the cookie or the 2Captcha key; only whether they are set.
import { route } from '@/lib/server/route-helpers';
import { sunoStatus } from '@/lib/server/music/suno';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = route(() => sunoStatus(), { tag: 'music api' });
