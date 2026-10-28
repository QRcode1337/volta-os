// GET    /api/editor/nle/projects            → { projects: NleProjectSummary[] } newest first
// GET    /api/editor/nle/projects?id=seq_…   → { sequence }
// POST   /api/editor/nle/projects {sequence} → { ok: true, updatedAt }   (≤ 2 MB, atomic write)
// DELETE /api/editor/nle/projects?id=seq_…   → { ok: true }               (moved to projects/.trash/)
import { route } from '@/lib/server/route-helpers';
import { deleteProject, listProjects, loadProject, MAX_SEQUENCE_BYTES, saveProject } from '@/lib/server/editor/nle/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async ({ url }) => {
  const id = url.searchParams.get('id');
  if (id !== null) return { sequence: await loadProject(id) };
  return { projects: await listProjects() };
});

export const POST = route(({ body }) => saveProject(body.sequence), { json: true, maxBytes: MAX_SEQUENCE_BYTES + 4096 });

export const DELETE = route(({ url }) => deleteProject(url.searchParams.get('id') ?? ''), { json: true });
