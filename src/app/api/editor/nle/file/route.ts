// GET /api/editor/nle/file?id=u_<16 hex>   an Edit-mode upload
// GET /api/editor/nle/file?id=x_<job id>   a finished export
// Range-capable (video / audio seeking). Loopback + same-origin only.
import { HttpError, route } from '@/lib/server/route-helpers';
import { MIME_BY_EXT, UPLOAD_ID, uploadFile } from '@/lib/server/editor/nle/assets';
import { exportFile } from '@/lib/server/editor/nle/export';
import { streamFile } from '@/lib/server/editor/nle/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async ({ req, url }) => {
  const id = url.searchParams.get('id') ?? '';
  if (UPLOAD_ID.test(id)) {
    const u = await uploadFile(id);
    return streamFile(req, u.path, MIME_BY_EXT[u.meta.ext] ?? 'application/octet-stream', u.meta.name);
  }
  if (/^x_[0-9a-f]{16}$/.test(id)) {
    const f = await exportFile(id.slice(2));
    return streamFile(req, f.path, 'video/mp4', f.name);
  }
  throw new HttpError('Bad file id.', 400);
});
