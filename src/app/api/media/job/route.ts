// GET /api/media/job?id= — progress of a running/finished generation.
import { NextResponse } from 'next/server';
import { rejectNonLocalRead } from '@/lib/server/local-only';
import { getJob } from '@/lib/server/media/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: 'Unknown job (the server may have restarted).' }, { status: 404 });
  return NextResponse.json(job, { headers: { 'Cache-Control': 'no-store' } });
}
