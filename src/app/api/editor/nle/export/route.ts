// POST   /api/editor/nle/export (NleExportRequest) → { job }    one export runs at a time; the rest queue
// GET    /api/editor/nle/export?id=<jobId>         → { job }
// GET    /api/editor/nle/export                    → { jobs }   recent, newest first
// DELETE /api/editor/nle/export?id=<jobId>         → { job }    cancels (SIGTERM ffmpeg, partial file deleted)
import { studioGet } from '@/lib/server/studio/http';
import { cancelExport, getJob, listJobs, startExport } from '@/lib/server/editor/nle/export';
import { nleMutation } from '@/lib/server/editor/nle/http';
import { MAX_SEQUENCE_BYTES } from '@/lib/server/editor/nle/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = studioGet(async (req) => {
  const id = new URL(req.url).searchParams.get('id');
  if (id !== null) return { job: await getJob(id) };
  return { jobs: await listJobs() };
});

export const POST = nleMutation(async (body) => ({ job: await startExport(body) }), MAX_SEQUENCE_BYTES + 4096);

export const DELETE = nleMutation(async (_body, req) => ({ job: await cancelExport(new URL(req.url).searchParams.get('id') ?? '') }));
