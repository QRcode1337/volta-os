// GET /api/editor/nle/file?id=u_<16 hex>   an Edit-mode upload
// GET /api/editor/nle/file?id=x_<job id>   a finished export
// Range-capable (video / audio seeking). Loopback + same-origin only.
import { HttpError, route, streamFile } from '@/lib/server/route-helpers';
import { uploadFile } from '@/lib/server/editor/nle/assets';
import { MIME_BY_EXT, parseMediaId } from '@/lib/media-ids';
import { exportFile } from '@/lib/server/editor/nle/export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async ({ req, url }) => {
  const id = url.searchParams.get('id') ?? '';
  if (parseMediaId(id)?.kind === 'u') {
    const u = await uploadFile(id);
    return streamFile(req, u.path, { mime: MIME_BY_EXT[u.meta.ext] ?? 'application/octet-stream', name: u.meta.name });
  }
  if (/^x_[0-9a-f]{16}$/.test(id)) {
    const f = await exportFile(id.slice(2));
    return streamFile(req, f.path, { mime: 'video/mp4', name: f.name });
  }
  throw new HttpError('Bad file id.', 400);
});
