import 'server-only';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { rejectNonLocalMutation } from '../../local-only';
import { fail } from '../../studio/http';
import { NleError } from './paths';

// Small route helpers shared by /api/editor/nle/*. Errors are always `{ error }` JSON with the right status.

export const noStore = { 'Cache-Control': 'no-store' };

/** JSON-bodied mutation (POST / DELETE): loopback + same-origin + application/json, bounded body. */
export function nleMutation(run: (body: Record<string, unknown>, req: Request) => Promise<unknown> | unknown, maxBytes = 64 * 1024) {
  return async function handler(req: Request) {
    const denied = rejectNonLocalMutation(req);
    if (denied) return denied;
    try {
      const text = await req.text();
      if (Buffer.byteLength(text) > maxBytes) throw new NleError(`Request body larger than ${Math.round(maxBytes / 1024)} KB.`, 413);
      let body: unknown = {};
      if (text.trim()) {
        try {
          body = JSON.parse(text);
        } catch {
          throw new NleError('Body must be valid JSON.', 400);
        }
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new NleError('Body must be a JSON object.', 400);
      return NextResponse.json(await run(body as Record<string, unknown>, req), { headers: noStore });
    } catch (err) {
      return fail(err);
    }
  };
}

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
  if (!st?.isFile()) throw new NleError('File not found.', 404);
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
