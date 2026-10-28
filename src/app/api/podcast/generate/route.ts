import { NextResponse } from 'next/server';
import { HttpError, NO_STORE, route } from '@/lib/server/route-helpers';
import { loadConfig } from '@/lib/server/podcast/config';
import { startGeneration } from '@/lib/server/podcast/pipeline';
import { errMsg } from '@/lib/server/podcast/util';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/podcast/generate  { date?, force?, freshResearch?, confirmUsd?, scheduled? }  (localhost only, JSON)
 * Starts a background job and returns it; poll GET /api/podcast/job. 402 = confirm the cost first, 409 = busy / already exists,
 * 507 = Windsor missing or full. `scheduled: true` (the LaunchAgent script) skips the UI confirm but never the hard cap.
 * Every error carries `needsConfirm` (true only for 402) for the UI's confirm step.
 */
export const POST = route(
  async ({ body }) => {
    try {
      if (loadConfig().externalFeed) throw new HttpError('Episodes now come from the muse.ai feed; local generation is disabled (remove externalFeed from config/podcast.json to re-enable).', 410);
      const job = await startGeneration({
        date: typeof body.date === 'string' ? body.date : undefined,
        force: body.force === true,
        freshResearch: body.freshResearch === true,
        confirmUsd: typeof body.confirmUsd === 'number' ? body.confirmUsd : undefined,
        trigger: body.scheduled === true ? 'scheduled' : 'manual',
      });
      return NextResponse.json({ job }, { status: 202, headers: NO_STORE });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      throw new HttpError(errMsg(e), status, { needsConfirm: status === 402 });
    }
  },
  { json: true },
);
