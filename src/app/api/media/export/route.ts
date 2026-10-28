// POST /api/media/export {filter, name, ids?} — copy generated files into a NEW folder under
// /Volumes/Windsor/VOLTA/exports/<name>/ with an index.csv. Copies only; spends nothing.
// POST /api/media/export {open: "<folder name>"} — show that export folder in Finder.
import { BIN, runOrThrow } from '@/lib/server/proc';
import { route } from '@/lib/server/route-helpers';
import { toHttpError } from '@/lib/server/media/config';
import { exportItems, resolveExportDir } from '@/lib/server/media/export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(
  async ({ body }) => {
    try {
      if (body.open !== undefined) {
        const dir = await resolveExportDir(body.open);
        await runOrThrow(BIN.open, [dir], { timeoutMs: 10_000 });
        return { ok: true, dir };
      }
      return await exportItems({ filter: body.filter, name: body.name, ids: body.ids });
    } catch (err) {
      throw toHttpError(err);
    }
  },
  { json: true, maxBytes: 256 * 1024 },
);
