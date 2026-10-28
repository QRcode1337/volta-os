// GET /api/media/file?id= — stream a generated file from the manifest, with Range support (video / audio seeking).
import { route, streamFile } from '@/lib/server/route-helpers';
import { toHttpError } from '@/lib/server/media/config';
import { resolveFile } from '@/lib/server/media/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Generated files never change once written, so they cache immutably.
export const GET = route(async ({ req, url }) => {
  try {
    const { rec, file } = await resolveFile(url.searchParams.get('id') ?? '');
    return await streamFile(req, file, { mime: rec.mime || 'application/octet-stream', cache: 'private, max-age=3600, immutable' });
  } catch (err) {
    throw toHttpError(err);
  }
});
