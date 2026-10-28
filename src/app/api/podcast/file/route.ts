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

/**
 * Stream the muse.ai mp3 through this origin: its CDN replies Cross-Origin-Resource-Policy: same-origin (and a download-only
 * Content-Disposition), so a browser refuses to play it from our page. Range is forwarded for seeking; ?download=1 saves it.
 */
async function proxyRemote(req: Request, url: string, name: string): Promise<Response> {
  const range = req.headers.get('range');
  const up = await fetch(url, { method: req.method, headers: range ? { Range: range } : {}, redirect: 'follow', signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!up || !(up.status === 200 || up.status === 206)) {
    return NextResponse.json({ error: `muse.ai audio unavailable (${up?.status ?? 'network error'})` }, { status: 502 });
  }
  const h = new Headers(PRIVATE_HEADERS);
  for (const k of ['content-length', 'content-range', 'accept-ranges']) {
    const v = up.headers.get(k);
    if (v) h.set(k, v);
  }
  h.set('Content-Type', 'audio/mpeg');
  h.set('Cache-Control', 'private, max-age=3600');
  const dl = new URL(req.url).searchParams.get('download') === '1';
  h.set('Content-Disposition', `${dl ? 'attachment' : 'inline'}; filename="${name}"`);
  return new Response(req.method === 'HEAD' ? null : up.body, { status: up.status, headers: h });
}

async function serve(req: Request) {
  const denied = authorizeFeedRequest(req);
  if (denied) return denied;
  const date = new URL(req.url).searchParams.get('date') ?? '';
  if (!isDate(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 });
  const variant = new URL(req.url).searchParams.get('src') === 'gemini' ? 'gemini' : undefined;
  const ep = await getEpisode(date, variant).catch(() => null);
  if (!ep) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (ep.audioUrl) return proxyRemote(req, ep.audioUrl, `${date}.mp3`);
  if (!(await fs.promises.stat(ep.file).catch(() => null))) {
    return NextResponse.json({ error: 'Audio file is not available (is the Windsor drive mounted?)' }, { status: 503 });
  }
  const dl = new URL(req.url).searchParams.get('download') === '1';
  try {
    return await streamFile(req, ep.file, { mime: 'audio/mpeg', name: `${date}${variant ? '-gemini' : ''}.mp3`, cache: 'private, max-age=3600', headers: dl ? { ...PRIVATE_HEADERS, 'Content-Disposition': `attachment; filename="${date}${variant ? '-gemini' : ''}.mp3"` } : PRIVATE_HEADERS });
  } catch (err) {
    return errorResponse(err, 'podcast file');
  }
}

export const GET = serve;
export const HEAD = serve;
