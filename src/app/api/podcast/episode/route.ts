import { NextResponse } from 'next/server';
import { rejectNonLocalRead } from '@/lib/server/local-only';
import { getEpisode, readText } from '@/lib/server/podcast/storage';
import { errMsg, isDate } from '@/lib/server/podcast/util';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/podcast/episode?date=YYYY-MM-DD → { episode, notes, script } (localhost only) */
export async function GET(req: Request) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  const date = new URL(req.url).searchParams.get('date') ?? '';
  if (!isDate(date)) return NextResponse.json({ error: '`date` must be YYYY-MM-DD.' }, { status: 400 });
  try {
    const episode = await getEpisode(date);
    if (!episode) return NextResponse.json({ error: `No episode for ${date}.` }, { status: 404 });
    const [notes, script] = await Promise.all([readText(episode.notesFile), readText(episode.scriptFile)]);
    return NextResponse.json({ episode, notes: notes ?? '', script: script ?? '' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
