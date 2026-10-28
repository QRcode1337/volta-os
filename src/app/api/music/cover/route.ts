// GET /api/music/cover?id=  embedded cover art (ffmpeg, local files only). 404 when the track has none.
import { NextResponse } from 'next/server';
import { route } from '@/lib/server/route-helpers';
import { trackCover } from '@/lib/server/music';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  async ({ url }) => {
    const c = await trackCover(url.searchParams.get('id') ?? '');
    return new NextResponse(new Uint8Array(c.data), {
      headers: { 'Content-Type': c.mime, 'Content-Length': String(c.data.length), 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' },
    });
  },
  { tag: 'music api' },
);
