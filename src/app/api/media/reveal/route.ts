// POST /api/media/reveal {id} — show a generated file in Finder. The path comes from the manifest, never the client.
import { execFile } from 'node:child_process';
import { route } from '@/lib/server/route-helpers';
import { toHttpError } from '@/lib/server/media/config';
import { resolveFile } from '@/lib/server/media/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(
  async ({ body }) => {
    try {
      const { file } = await resolveFile(typeof body.id === 'string' ? body.id : '');
      await new Promise<void>((resolve, reject) => execFile('/usr/bin/open', ['-R', file], (e) => (e ? reject(e) : resolve())));
      return { ok: true, file };
    } catch (err) {
      throw toHttpError(err);
    }
  },
  { json: true },
);
