// POST /api/music/suno/save  { ids, title, tags, lyrics, instrumental, credits }
// Downloads the finished mp3s to /Volumes/Windsor/VOLTA/music/suno/ (a library root in config/music.json) and records
// the credits (Patrick + Suno, optionally Seraphim of the Void) in /Volumes/Windsor/VOLTA/music/meta.json.
// Idempotent: clips already on disk are not downloaded again and existing notes are not overwritten. Spends nothing.
import { route } from '@/lib/server/route-helpers';
import { saveClips } from '@/lib/server/music/suno';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const POST = route(({ body }) => saveClips(body), { json: true, maxBytes: 64 * 1024, tag: 'music api' });
