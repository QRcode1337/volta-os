// GET /api/studio/projects: configured projects with presets (no raw argv), compositions and Windsor status.
import { route } from '@/lib/server/route-helpers';
import { listProjects } from '@/lib/server/studio/index-projects';
import { checkStudioStorage } from '@/lib/server/studio/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const [{ projects, errors }, storage] = await Promise.all([listProjects(), checkStudioStorage()]);
  return { projects, configErrors: errors, storage };
});
