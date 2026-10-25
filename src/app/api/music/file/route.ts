// GET /api/music/file?id=  stream a track with Range support (seeking).
// The id comes from the index; its realpath must sit inside an enabled root in config/music.json.
// iCloud placeholders are refused with 409 (opening one would force a download).
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { rejectNonLocalRead } from '@/lib/server/local-only';
import { assertLocal, fail, resolveTrack } from '@/lib/server/music';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseRange(header: string, size: number): { start: number; end: number } | 'invalid' | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null; // not a single range we understand: serve the whole file
  let start: number;
  let end: number;
  if (m[1] === '' && m[2] === '') return 'invalid';
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!(start <= end) || start >= size) return 'invalid';
  return { start, end };
}

export async function GET(req: Request) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  try {
    const r = await resolveTrack(new URL(req.url).searchParams.get('id') ?? '');
    assertLocal(r);
    const base = {
      'Content-Type': r.mime,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-cache',
      ETag: `"${r.size}-${Math.round(r.mtimeMs)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="${r.track.fileName.replace(/[^\w.-]+/g, '_')}"`,
    };
    const rangeHeader = req.headers.get('range');
    const range = rangeHeader ? parseRange(rangeHeader, r.size) : null;
    if (range === 'invalid') return new NextResponse(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${r.size}` } });
    if (r.size === 0) return new NextResponse(null, { status: 200, headers: { ...base, 'Content-Length': '0' } });
    const [start, end] = range ? [range.start, range.end] : [0, r.size - 1];
    const nodeStream = fs.createReadStream(r.path, { start, end });
    req.signal.addEventListener('abort', () => nodeStream.destroy());
    return new NextResponse(Readable.toWeb(nodeStream) as ReadableStream, {
      status: range ? 206 : 200,
      headers: { ...base, 'Content-Length': String(end - start + 1), ...(range ? { 'Content-Range': `bytes ${start}-${end}/${r.size}` } : {}) },
    });
  } catch (err) {
    return fail(err);
  }
}
