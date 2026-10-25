// PUT /api/music/meta  { id, meta }  replace one track's notes (lyrics, credits, Suno link, tags, BPM, key).
// An empty meta object removes the entry. Stored in /Volumes/Windsor/VOLTA/music/meta.json.
import { musicPut } from '@/lib/server/music/http';
import { MusicError, metaKeyFor, resolveTrack, sanitizeMeta, writeTrackMeta } from '@/lib/server/music';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = musicPut(async (body) => {
  if (typeof body.id !== 'string') throw new MusicError('id is required.', 400);
  const meta = sanitizeMeta(body.meta);
  const { track } = await resolveTrack(body.id);
  const saved = await writeTrackMeta(metaKeyFor(track), meta);
  return { id: track.id, meta: saved ?? {} };
}, { maxBytes: 400 * 1024 });
