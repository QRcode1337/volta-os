// GET /api/studio/outputs?projectId=<id>[&limit=40][&refresh=1]   recent media of one project
// GET /api/studio/outputs?scope=inputs                           pickable ffmpeg inputs: every project's newest outputs + Generations video/voice
import { studioGet } from '@/lib/server/studio/http';
import { generationInputs, projectOutputs } from '@/lib/server/studio/index-projects';
import { getProject, loadConfig } from '@/lib/server/studio/config';
import { StudioError } from '@/lib/server/studio/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = studioGet(async (req) => {
  const url = new URL(req.url);
  const refresh = url.searchParams.get('refresh') === '1';
  if (url.searchParams.get('scope') === 'inputs') {
    const per = await Promise.all(
      loadConfig().projects.map(async (p) => {
        const { items } = await projectOutputs(p, { limit: 15, refresh });
        return items.map((o) => ({ ...o, projectName: p.name }));
      }),
    );
    const outputs = per.flat().sort((a, b) => (a.mtime < b.mtime ? 1 : -1)).slice(0, 80);
    return { outputs, generations: await generationInputs(60) };
  }
  const project = getProject(url.searchParams.get('projectId') ?? '');
  if (!project) throw new StudioError('Unknown project.', 404);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 40));
  return projectOutputs(project, { limit, refresh });
});
