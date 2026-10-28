// POST /api/media/export {filter, name, ids?} — copy generated files into a NEW folder under
// /Volumes/Windsor/VOLTA/exports/<name>/ with an index.csv. Copies only; spends nothing.
// POST /api/media/export {open: "<folder name>"} — show that export folder in Finder.
import { execFile } from 'node:child_process';
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
        await new Promise<void>((resolve, reject) => execFile('/usr/bin/open', [dir], (e) => (e ? reject(e) : resolve())));
        return { ok: true, dir };
      }
      return await exportItems({ filter: body.filter, name: body.name, ids: body.ids });
    } catch (err) {
      throw toHttpError(err);
    }
  },
  { json: true, maxBytes: 256 * 1024 },
);
