// GET    /api/editor/nle/projects            → { projects: NleProjectSummary[] } newest first
// GET    /api/editor/nle/projects?id=seq_…   → { sequence }
// POST   /api/editor/nle/projects {sequence} → { ok: true, updatedAt }   (≤ 2 MB, atomic write)
// DELETE /api/editor/nle/projects?id=seq_…   → { ok: true }               (moved to projects/.trash/)
import { studioGet } from '@/lib/server/studio/http';
import { deleteProject, listProjects, loadProject, MAX_SEQUENCE_BYTES, saveProject } from '@/lib/server/editor/nle/projects';
import { nleMutation } from '@/lib/server/editor/nle/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = studioGet(async (req) => {
  const id = new URL(req.url).searchParams.get('id');
  if (id !== null) return { sequence: await loadProject(id) };
  return { projects: await listProjects() };
});

export const POST = nleMutation((body) => saveProject(body.sequence), MAX_SEQUENCE_BYTES + 4096);

export const DELETE = nleMutation((_body, req) => deleteProject(new URL(req.url).searchParams.get('id') ?? ''));
