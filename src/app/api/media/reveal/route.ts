// POST /api/media/reveal {id} — show a generated file in Finder. The path comes from the manifest, never the client.
import { BIN, runOrThrow } from '@/lib/server/proc';
import { route } from '@/lib/server/route-helpers';
import { toHttpError } from '@/lib/server/media/config';
import { resolveFile } from '@/lib/server/media/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(
  async ({ body }) => {
    try {
      const { file } = await resolveFile(typeof body.id === 'string' ? body.id : '');
      await runOrThrow(BIN.open, ['-R', file], { timeoutMs: 10_000 });
      return { ok: true, file };
    } catch (err) {
      throw toHttpError(err);
    }
  },
  { json: true },
);
