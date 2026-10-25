// GET /api/editor/media[?refresh=1]   the media bin: real Studio outputs per project + the Generations manifest
// GET /api/editor/media?id=<fileKey>  one file (inbox hand-offs): { item }
import { studioGet } from '@/lib/server/studio/http';
import { describeEditorMedia, listEditorMedia } from '@/lib/server/editor/media';
import { requireFileKey } from '@/lib/server/editor/feedback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = studioGet(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (id !== null) return { item: await describeEditorMedia(requireFileKey(id)) };
  return listEditorMedia({ refresh: url.searchParams.get('refresh') === '1' });
});
