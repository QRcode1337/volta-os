// GET /api/editor/nle/thumbs?id=<assetId>&count=1..40        → { url, count, frameW, frameH, duration }
// GET /api/editor/nle/thumbs?id=<assetId>&count=N&img=1      → JPEG sprite: ONE horizontal strip of `count` frames,
//     each frameW × frameH (90). Images: count is always 1. Audio-only: 404 { error }.
import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { rejectNonLocalRead } from '@/lib/server/local-only';
import { fail } from '@/lib/server/studio/http';
import { getThumbs } from '@/lib/server/editor/nle/thumbs';
import { noStore } from '@/lib/server/editor/nle/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  try {
    const u = new URL(req.url);
    const t = await getThumbs(u.searchParams.get('id') ?? '', Number(u.searchParams.get('count') ?? 10));
    if (u.searchParams.get('img') !== '1') return NextResponse.json(t.meta, { headers: noStore });
    const headers = { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-cache', ETag: t.etag, 'X-Content-Type-Options': 'nosniff' };
    if (req.headers.get('if-none-match') === t.etag) return new NextResponse(null, { status: 304, headers });
    const buf = await fs.readFile(t.file);
    return new NextResponse(new Uint8Array(buf), { headers: { ...headers, 'Content-Length': String(buf.length) } });
  } catch (err) {
    return fail(err);
  }
}
