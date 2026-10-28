// POST /api/music/suno/generate  { mode: 'song' | 'speech', title, tags, lyrics, instrumental, script, tone, confirm: true }
// Opens an interactive `claude --chrome` session in Terminal that creates it on suno.com in Patrick's Chrome and downloads
// the MP3s. THIS SPENDS SUNO CREDITS, so `confirm: true` is required. Returns { opened, error, prompt, since }; once the
// downloads are done, POST /api/music/suno/import with `since` moves them into the library.
import { route } from '@/lib/server/route-helpers';
import { createViaChrome } from '@/lib/server/music/suno';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const POST = route(({ body }) => createViaChrome(body), { json: true, maxBytes: 32 * 1024, tag: 'music api' });
