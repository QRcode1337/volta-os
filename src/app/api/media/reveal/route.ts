// POST /api/media/reveal {id} — show a generated file in Finder. The path comes from the manifest, never the client.
import { execFile } from 'node:child_process';
import { NextResponse } from 'next/server';
import { rejectNonLocalMutation } from '@/lib/server/local-only';
import { errorMessage, errorStatus } from '@/lib/server/media/config';
import { resolveFile } from '@/lib/server/media/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = rejectNonLocalMutation(req);
  if (denied) return denied;
  try {
    const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
    const { file } = await resolveFile(typeof body?.id === 'string' ? body.id : '');
    await new Promise<void>((resolve, reject) => execFile('/usr/bin/open', ['-R', file], (e) => (e ? reject(e) : resolve())));
    return NextResponse.json({ ok: true, file });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: errorStatus(err) });
  }
}
