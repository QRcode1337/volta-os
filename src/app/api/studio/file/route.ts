// GET /api/studio/file?id=  stream a project output with Range support (video / audio seeking).
// The id comes from the project index; its path must resolve inside a known project folder or the Windsor studio root.
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { HttpError, route } from '@/lib/server/route-helpers';
import { resolveOutputFile } from '@/lib/server/studio/index-projects';

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

export const GET = route(async ({ req, url }) => {
  const f = await resolveOutputFile(url.searchParams.get('id') ?? '');
  if (f.offline) throw new HttpError(`${f.name} is an iCloud placeholder (not downloaded). Open it in Finder first.`, 409);
  const base = {
    'Content-Type': f.mime,
    'Accept-Ranges': 'bytes',
    // outputs can be overwritten in place, so revalidate instead of caching immutably
    'Cache-Control': 'private, no-cache',
    ETag: `"${f.size}-${Math.round(f.mtimeMs)}"`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `inline; filename="${f.name.replace(/[^\w.-]+/g, '_')}"`,
  };
  const rangeHeader = req.headers.get('range');
  const range = rangeHeader ? parseRange(rangeHeader, f.size) : null;
  if (range === 'invalid') return new NextResponse(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${f.size}` } });
  if (f.size === 0) return new NextResponse(null, { status: 200, headers: { ...base, 'Content-Length': '0' } });
  const [start, end] = range ? [range.start, range.end] : [0, f.size - 1];
  const nodeStream = fs.createReadStream(f.path, { start, end });
  req.signal.addEventListener('abort', () => nodeStream.destroy());
  return new NextResponse(Readable.toWeb(nodeStream) as ReadableStream, {
    status: range ? 206 : 200,
    headers: { ...base, 'Content-Length': String(end - start + 1), ...(range ? { 'Content-Range': `bytes ${start}-${end}/${f.size}` } : {}) },
  });
});
