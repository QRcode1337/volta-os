// POST /api/media/generate {quoteId} — spend money. Needs a valid, unexpired, unused quote; one generation at a time.
// Returns 202 {jobId}; poll GET /api/media/job?id=.
import { NextResponse } from 'next/server';
import { rejectNonLocalMutation } from '@/lib/server/local-only';
import { errorMessage, errorStatus } from '@/lib/server/media/config';
import { startGeneration } from '@/lib/server/media/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = rejectNonLocalMutation(req);
  if (denied) return denied;
  let raw: { quoteId?: unknown } | null;
  try {
    raw = (await req.json()) as { quoteId?: unknown } | null;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  try {
    const { jobId } = await startGeneration(raw?.quoteId);
    return NextResponse.json({ jobId }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: errorStatus(err) });
  }
}
