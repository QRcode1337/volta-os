// POST /api/studio/jobs/:id/cancel   queued: dropped; running: SIGTERM, then SIGKILL after 8 s
import { rejectNonLocalMutation } from '@/lib/server/local-only';
import { fail } from '@/lib/server/studio/http';
import { JOB_ID_RE, cancelJob } from '@/lib/server/studio/runner';
import { StudioError } from '@/lib/server/studio/storage';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = rejectNonLocalMutation(req);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    if (!JOB_ID_RE.test(id)) throw new StudioError('Bad job id.', 400);
    return NextResponse.json({ job: await cancelJob(id) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return fail(err);
  }
}
