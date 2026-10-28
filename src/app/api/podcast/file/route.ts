// GET|HEAD /api/podcast/file?date=YYYY-MM-DD&token=…  stream an episode mp3 with Range support (seeking, resume, iOS).
// Only files recorded in the podcast manifest are served; the date is validated, never used as a path.
// Not on route(): podcast apps authenticate with the feed token (authorizeFeedRequest), not the tailnet guard.
import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { errorResponse, streamFile } from '@/lib/server/route-helpers';
import { authorizeFeedRequest, PRIVATE_HEADERS } from '@/lib/server/podcast/auth';
import { getEpisode } from '@/lib/server/podcast/storage';
import { isDate } from '@/lib/server/podcast/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function serve(req: Request) {
  const denied = authorizeFeedRequest(req);
  if (denied) return denied;
  const date = new URL(req.url).searchParams.get('date') ?? '';
  if (!isDate(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 });
  const ep = await getEpisode(date).catch(() => null);
  if (!ep) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (ep.audioUrl) return NextResponse.redirect(ep.audioUrl, 302);
  if (!(await fs.promises.stat(ep.file).catch(() => null))) {
    return NextResponse.json({ error: 'Audio file is not available (is the Windsor drive mounted?)' }, { status: 503 });
  }
  try {
    return await streamFile(req, ep.file, { mime: 'audio/mpeg', name: `${date}.mp3`, cache: 'private, max-age=3600', headers: PRIVATE_HEADERS });
  } catch (err) {
    return errorResponse(err, 'podcast file');
  }
}

export const GET = serve;
export const HEAD = serve;
