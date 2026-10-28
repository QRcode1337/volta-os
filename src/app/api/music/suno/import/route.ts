// POST /api/music/suno/import  { since, mode, title, tags, lyrics, instrumental, credits }
// Moves the .mp3/.wav files downloaded since `since` from ~/Downloads into /Volumes/Windsor/VOLTA/music/suno/ (a library
// root in config/music.json) and records the credits (Patrick + Suno, optionally Seraphim of the Void) in
// /Volumes/Windsor/VOLTA/music/meta.json. Idempotent: files are named by content hash, so duplicates are not copied
// twice and existing notes are not overwritten. Spends nothing.
import { route } from '@/lib/server/route-helpers';
import { importDownloads } from '@/lib/server/music/suno';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const POST = route(({ body }) => importDownloads(body), { json: true, maxBytes: 64 * 1024, tag: 'music api' });
