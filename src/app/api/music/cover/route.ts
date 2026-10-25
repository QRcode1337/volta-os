// GET /api/music/cover?id=  embedded cover art (ffmpeg, local files only). 404 when the track has none.
import { NextResponse } from 'next/server';
import { rejectNonLocalRead } from '@/lib/server/local-only';
import { fail, trackCover } from '@/lib/server/music';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  try {
    const c = await trackCover(new URL(req.url).searchParams.get('id') ?? '');
    return new NextResponse(new Uint8Array(c.data), {
      headers: { 'Content-Type': c.mime, 'Content-Length': String(c.data.length), 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (err) {
    return fail(err);
  }
}
