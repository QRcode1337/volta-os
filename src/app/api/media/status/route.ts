// GET /api/media/status — provider catalogs (live model lists), ElevenLabs quota, storage state, today's est. spend.
// Never contains API keys.
import { route } from '@/lib/server/route-helpers';
import { getStatus } from '@/lib/server/media/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(() => getStatus());
