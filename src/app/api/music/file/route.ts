// GET /api/music/file?id=  stream a track with Range support (seeking).
// The id comes from the index; its realpath must sit inside an enabled root in config/music.json.
// iCloud placeholders are refused with 409 (opening one would force a download).
import { route, streamFile } from '@/lib/server/route-helpers';
import { assertLocal, resolveTrack } from '@/lib/server/music';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  async ({ req, url }) => {
    const r = await resolveTrack(url.searchParams.get('id') ?? '');
    assertLocal(r);
    return streamFile(req, r.path, { mime: r.mime, name: r.track.fileName });
  },
  { tag: 'music api' },
);
