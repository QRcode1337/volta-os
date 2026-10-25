import { NextResponse } from 'next/server';
import { rejectNonLocalMutation } from '@/lib/server/local-only';
import { localJson } from '@/lib/server/route-helpers';
import { loadConfig, patchConfig } from '@/lib/server/podcast/config';
import { errMsg } from '@/lib/server/podcast/util';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/podcast/config → the parsed config/podcast.json */
export const GET = localJson(async () => loadConfig());

/** PUT /api/podcast/config  { weights?: {topicId: 0-5}, storyCount?: 6-10 }  (the only fields editable from the app) */
export async function PUT(req: Request) {
  const denied = rejectNonLocalMutation(req);
  if (denied) return denied;
  try {
    const body = (await req.json()) as { weights?: Record<string, number>; storyCount?: number };
    return NextResponse.json(patchConfig({ weights: body.weights, storyCount: body.storyCount }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 400 });
  }
}
