// POST /api/media/generate {quoteId} — spend money. Needs a valid, unexpired, unused quote; one generation at a time.
// Returns 202 {jobId}; poll GET /api/media/job?id=.
import { NextResponse } from 'next/server';
import { NO_STORE, route } from '@/lib/server/route-helpers';
import { toHttpError } from '@/lib/server/media/config';
import { startGeneration } from '@/lib/server/media/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(
  async ({ body }) => {
    try {
      const { jobId } = await startGeneration(body.quoteId);
      return NextResponse.json({ jobId }, { status: 202, headers: NO_STORE });
    } catch (err) {
      throw toHttpError(err);
    }
  },
  { json: true },
);
