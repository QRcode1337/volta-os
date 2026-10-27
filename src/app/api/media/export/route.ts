// POST /api/media/export {filter, name, ids?} — copy generated files into a NEW folder under
// /Volumes/Windsor/VOLTA/exports/<name>/ with an index.csv. Copies only; spends nothing.
// POST /api/media/export {open: "<folder name>"} — show that export folder in Finder.
import { execFile } from 'node:child_process';
import { NextResponse } from 'next/server';
import { rejectNonLocalMutation } from '@/lib/server/local-only';
import { errorMessage, errorStatus } from '@/lib/server/media/config';
import { exportItems, resolveExportDir } from '@/lib/server/media/export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = rejectNonLocalMutation(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { filter?: unknown; name?: unknown; ids?: unknown; open?: unknown } | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  try {
    if (body.open !== undefined) {
      const dir = await resolveExportDir(body.open);
      await new Promise<void>((resolve, reject) => execFile('/usr/bin/open', [dir], (e) => (e ? reject(e) : resolve())));
      return NextResponse.json({ ok: true, dir });
    }
    return NextResponse.json(await exportItems({ filter: body.filter, name: body.name, ids: body.ids }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: errorStatus(err) });
  }
}
