// GET|HEAD /api/podcast/file?date=YYYY-MM-DD&token=…  stream an episode mp3 with Range support (seeking, resume, iOS).
// Only files recorded in the podcast manifest are served; the date is validated, never used as a path.
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { authorizeFeedRequest, PRIVATE_HEADERS } from '@/lib/server/podcast/auth';
import { getEpisode } from '@/lib/server/podcast/storage';
import { isDate } from '@/lib/server/podcast/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseRange(header: string, size: number): { start: number; end: number } | 'invalid' | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null; // multi-range or unknown unit: serve the whole file
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

async function serve(req: Request, head: boolean) {
  const denied = authorizeFeedRequest(req);
  if (denied) return denied;
  const date = new URL(req.url).searchParams.get('date') ?? '';
  if (!isDate(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 });
  const ep = await getEpisode(date).catch(() => null);
  if (!ep) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let st: fs.Stats;
  try {
    st = await fs.promises.stat(ep.file);
  } catch {
    return NextResponse.json({ error: 'Audio file is not available (is the Windsor drive mounted?)' }, { status: 503 });
  }
  const size = st.size;
  const base = {
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    ETag: `"${size}-${Math.round(st.mtimeMs)}"`,
    'Content-Disposition': `inline; filename="${date}.mp3"`,
    ...PRIVATE_HEADERS,
  };
  const rangeHeader = req.headers.get('range');
  const range = rangeHeader ? parseRange(rangeHeader, size) : null;
  if (range === 'invalid') return new NextResponse(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } });
  const [start, end] = range ? [range.start, range.end] : [0, size - 1];
  const headers = { ...base, 'Content-Length': String(size === 0 ? 0 : end - start + 1), ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) };
  const status = range ? 206 : 200;
  if (head || size === 0) return new NextResponse(null, { status, headers });
  const stream = fs.createReadStream(ep.file, { start, end });
  req.signal.addEventListener('abort', () => stream.destroy());
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, { status, headers });
}

export const GET = (req: Request) => serve(req, false);
export const HEAD = (req: Request) => serve(req, true);
