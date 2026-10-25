// GET  /api/studio/jobs                       queue + recent history + Windsor status
// POST /api/studio/jobs {projectId, presetId, args}   enqueue a PRESET from config/studio-projects.json (never a command string)
import { studioGet, studioPost } from '@/lib/server/studio/http';
import { createJob, listJobs } from '@/lib/server/studio/runner';
import { StudioError } from '@/lib/server/studio/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = studioGet(() => listJobs());
export const POST = studioPost(async (body) => {
  const extra = Object.keys(body).filter((k) => !['projectId', 'presetId', 'args'].includes(k));
  if (extra.length) throw new StudioError(`Unexpected field(s): ${extra.join(', ')}. Send {projectId, presetId, args}.`, 400);
  return { job: await createJob(body.projectId, body.presetId, body.args) };
});
