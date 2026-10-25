// GET /api/media/file?id= — stream a generated file from the manifest, with Range support (video / audio seeking).
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { rejectNonLocalRead } from '@/lib/server/local-only';
import { errorMessage, errorStatus } from '@/lib/server/media/config';
import { resolveFile } from '@/lib/server/media/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseRange(header: string, size: number): { start: number; end: number } | 'invalid' | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null; // not a range we understand: serve the whole file
  let start: number;
  let end: number;
  if (m[1] === '' && m[2] === '') return 'invalid';
  if (m[1] === '') {
    const suffix = Number(m[2]);
    start = Math.max(0, size - suffix);
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
    const id = new URL(req.url).searchParams.get('id') ?? '';
    const { rec, file, size } = await resolveFile(id);
    const base = {
      'Content-Type': rec.mime || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    };
    const rangeHeader = req.headers.get('range');
    const range = rangeHeader ? parseRange(rangeHeader, size) : null;
    if (range === 'invalid') return new NextResponse(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } });
    const [start, end] = range ? [range.start, range.end] : [0, size - 1];
    if (size === 0) return new NextResponse(null, { status: 200, headers: { ...base, 'Content-Length': '0' } });
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new NextResponse(stream, {
      status: range ? 206 : 200,
      headers: { ...base, 'Content-Length': String(end - start + 1), ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) },
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: errorStatus(err) });
  }
}
