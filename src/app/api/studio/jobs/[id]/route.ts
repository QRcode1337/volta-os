// GET /api/studio/jobs/:id
import { HttpError, route } from '@/lib/server/route-helpers';
import { JOB_ID_RE, getJob } from '@/lib/server/studio/runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route<{ id: string }>(async ({ params: { id } }) => {
  const job = JOB_ID_RE.test(id) ? await getJob(id) : null;
  if (!job) throw new HttpError('Job not found.', 404);
  return { job };
});
