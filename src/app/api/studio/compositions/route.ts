// POST /api/studio/compositions {projectId}: queue the project's slow `remotion compositions` listing (cached on success).
import { route } from '@/lib/server/route-helpers';
import { createCompositionsJob } from '@/lib/server/studio/runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async ({ body }) => ({ job: await createCompositionsJob(body.projectId) }), { json: true });
