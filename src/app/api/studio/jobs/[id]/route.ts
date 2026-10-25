// GET /api/studio/jobs/:id
import { studioGet } from '@/lib/server/studio/http';
import { JOB_ID_RE, getJob } from '@/lib/server/studio/runner';
import { StudioError } from '@/lib/server/studio/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return studioGet(async () => {
    const job = JOB_ID_RE.test(id) ? await getJob(id) : null;
    if (!job) throw new StudioError('Job not found.', 404);
    return { job };
  })(req);
}
