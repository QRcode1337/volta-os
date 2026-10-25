// PUT /api/music/roots  { path, enabled }  enable/disable a configured root, or add a discovered folder (config/music.json).
// The path must already be in the config or be one of the folders discovered under ~/Documents/Audio.
import { musicPut } from '@/lib/server/music/http';
import { MusicError, setRootEnabled } from '@/lib/server/music';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = musicPut(async (body) => {
  if (typeof body.path !== 'string' || !body.path.startsWith('/')) throw new MusicError('path must be an absolute folder path.', 400);
  if (typeof body.enabled !== 'boolean') throw new MusicError('enabled must be true or false.', 400);
  await setRootEnabled(body.path, body.enabled);
  return { ok: true };
}, { maxBytes: 4 * 1024 });
