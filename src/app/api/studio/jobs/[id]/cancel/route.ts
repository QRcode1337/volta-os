// POST /api/studio/jobs/:id/cancel   queued: dropped; running: SIGTERM, then SIGKILL after 8 s
import { HttpError, route } from '@/lib/server/route-helpers';
import { JOB_ID_RE, cancelJob } from '@/lib/server/studio/runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route<{ id: string }>(
  async ({ params: { id } }) => {
    if (!JOB_ID_RE.test(id)) throw new HttpError('Bad job id.', 400);
    return { job: await cancelJob(id) };
  },
  { mutation: true },
);
