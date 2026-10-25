import { localJson } from '@/lib/server/route-helpers';
import { currentJob } from '@/lib/server/podcast/pipeline';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/podcast/job → { job } the running or most recent generation (localhost only) */
export const GET = localJson(async () => ({ job: currentJob() }));
