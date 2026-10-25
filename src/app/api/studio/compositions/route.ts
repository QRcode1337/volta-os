// POST /api/studio/compositions {projectId}: queue the project's slow `remotion compositions` listing (cached on success).
import { studioPost } from '@/lib/server/studio/http';
import { createCompositionsJob } from '@/lib/server/studio/runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = studioPost(async (body) => ({ job: await createCompositionsJob(body.projectId) }));
