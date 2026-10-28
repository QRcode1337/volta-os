// GET  /api/studio/jobs                       queue + recent history + Windsor status
// POST /api/studio/jobs {projectId, presetId, args}   enqueue a PRESET from config/studio-projects.json (never a command string)
import { HttpError, route } from '@/lib/server/route-helpers';
import { createJob, listJobs } from '@/lib/server/studio/runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(() => listJobs());
export const POST = route(
  async ({ body }) => {
    const extra = Object.keys(body).filter((k) => !['projectId', 'presetId', 'args'].includes(k));
    if (extra.length) throw new HttpError(`Unexpected field(s): ${extra.join(', ')}. Send {projectId, presetId, args}.`, 400);
    return { job: await createJob(body.projectId, body.presetId, body.args) };
  },
  { json: true },
);
