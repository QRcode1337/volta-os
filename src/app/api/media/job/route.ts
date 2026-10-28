// GET /api/media/job?id= — progress of a running/finished generation.
import { HttpError, route } from '@/lib/server/route-helpers';
import { getJob } from '@/lib/server/media/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(({ url }) => {
  const job = getJob(url.searchParams.get('id') ?? '');
  if (!job) throw new HttpError('Unknown job (the server may have restarted).', 404);
  return job;
});
