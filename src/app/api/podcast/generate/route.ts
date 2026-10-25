import { NextResponse } from 'next/server';
import { rejectNonLocalMutation } from '@/lib/server/local-only';
import { PodcastError } from '@/lib/server/podcast/storage';
import { startGeneration } from '@/lib/server/podcast/pipeline';
import { errMsg } from '@/lib/server/podcast/util';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/podcast/generate  { date?, force?, freshResearch?, confirmUsd?, scheduled? }  (localhost only, JSON)
 * Starts a background job and returns it; poll GET /api/podcast/job. 402 = confirm the cost first, 409 = busy / already exists,
 * 507 = Windsor missing or full. `scheduled: true` (the LaunchAgent script) skips the UI confirm but never the hard cap.
 */
export async function POST(req: Request) {
  const denied = rejectNonLocalMutation(req);
  if (denied) return denied;
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // empty body is fine: defaults
  }
  try {
    const job = await startGeneration({
      date: typeof body.date === 'string' ? body.date : undefined,
      force: body.force === true,
      freshResearch: body.freshResearch === true,
      confirmUsd: typeof body.confirmUsd === 'number' ? body.confirmUsd : undefined,
      trigger: body.scheduled === true ? 'scheduled' : 'manual',
    });
    return NextResponse.json({ job }, { status: 202 });
  } catch (e) {
    const status = e instanceof PodcastError ? e.status : 500;
    return NextResponse.json({ error: errMsg(e), needsConfirm: status === 402 }, { status });
  }
}
