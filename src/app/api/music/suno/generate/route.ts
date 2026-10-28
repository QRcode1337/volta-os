// POST /api/music/suno/generate  { title, tags, lyrics, instrumental, confirm: true }
// Proxies to the local suno-api /api/custom_generate. THIS SPENDS SUNO CREDITS, so `confirm: true` is required.
// Returns the submitted clips ({ clips: [{ id, status, ... }], credits }); poll /api/music/suno/poll for the audio.
import { route } from '@/lib/server/route-helpers';
import { generate } from '@/lib/server/music/suno';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 200;

export const POST = route(({ body }) => generate(body), { json: true, maxBytes: 32 * 1024, tag: 'music api' });
