// PUT /api/music/roots  { path, enabled }  enable/disable a configured root, or add a discovered folder (config/music.json).
// The path must already be in the config or be one of the folders discovered under ~/Documents/Audio.
import { HttpError, route } from '@/lib/server/route-helpers';
import { setRootEnabled } from '@/lib/server/music';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = route(
  async ({ body }) => {
    if (typeof body.path !== 'string' || !body.path.startsWith('/')) throw new HttpError('path must be an absolute folder path.', 400);
    if (typeof body.enabled !== 'boolean') throw new HttpError('enabled must be true or false.', 400);
    await setRootEnabled(body.path, body.enabled);
    return { ok: true };
  },
  { json: true, maxBytes: 4 * 1024, tag: 'music api' },
);
