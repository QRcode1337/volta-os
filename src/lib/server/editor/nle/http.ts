import 'server-only';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { HttpError } from '../../route-helpers';

// Range-capable file streaming for /api/editor/nle/file. Errors are HttpError (the route wrapper turns them into `{ error }`).

function parseRange(header: string, size: number): { start: number; end: number } | 'invalid' | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  if (m[1] === '' && m[2] === '') return 'invalid';
  let start: number;
  let end: number;
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

/** Range-capable file response (same handling as /api/studio/file), with ETag revalidation. */
export async function streamFile(req: Request, file: string, mime: string, name: string, cache = 'private, no-cache'): Promise<Response> {
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st?.isFile()) throw new HttpError('File not found.', 404);
  const etag = `"${st.size}-${Math.round(st.mtimeMs)}"`;
  const base = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cache,
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `inline; filename="${name.replace(/[^\w.-]+/g, '_')}"`,
  };
  const rangeHeader = req.headers.get('range');
  if (!rangeHeader && req.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers: base });
  const range = rangeHeader ? parseRange(rangeHeader, st.size) : null;
  if (range === 'invalid') return new NextResponse(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${st.size}` } });
  if (st.size === 0) return new NextResponse(null, { status: 200, headers: { ...base, 'Content-Length': '0' } });
  const [start, end] = range ? [range.start, range.end] : [0, st.size - 1];
  const nodeStream = fs.createReadStream(file, { start, end });
  req.signal.addEventListener('abort', () => nodeStream.destroy());
  return new NextResponse(Readable.toWeb(nodeStream) as ReadableStream, {
    status: range ? 206 : 200,
    headers: { ...base, 'Content-Length': String(end - start + 1), ...(range ? { 'Content-Range': `bytes ${start}-${end}/${st.size}` } : {}) },
  });
}
