// POST   /api/editor/nle/export (NleExportRequest) → { job }    one export runs at a time; the rest queue
// GET    /api/editor/nle/export?id=<jobId>         → { job }
// GET    /api/editor/nle/export                    → { jobs }   recent, newest first
// DELETE /api/editor/nle/export?id=<jobId>         → { job }    cancels (SIGTERM ffmpeg, partial file deleted)
import { route } from '@/lib/server/route-helpers';
import { cancelExport, getJob, listJobs, startExport } from '@/lib/server/editor/nle/export';
import { MAX_SEQUENCE_BYTES } from '@/lib/server/editor/nle/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async ({ url }) => {
  const id = url.searchParams.get('id');
  if (id !== null) return { job: await getJob(id) };
  return { jobs: await listJobs() };
});

export const POST = route(async ({ body }) => ({ job: await startExport(body) }), { json: true, maxBytes: MAX_SEQUENCE_BYTES + 4096 });

export const DELETE = route(async ({ url }) => ({ job: await cancelExport(url.searchParams.get('id') ?? '') }), { json: true });
