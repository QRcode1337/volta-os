// GET /api/actions/note?path=wiki/main/concepts/x.md -> WikiNote
//   Read-only text of a wiki note the Tasks board links to (only files under ~/.openclaw/wiki), so the note can be
//   read in VOLTA on the phone instead of copying a Mac `open` command.
import { NextResponse } from 'next/server';
import { rejectNonLocalRead } from '@/lib/server/local-only';
import { NoteError, readWikiNote } from '@/lib/server/sources/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

export async function GET(req: Request) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await readWikiNote(new URL(req.url).searchParams.get('path') ?? ''), { headers: noStore });
  } catch (err) {
    if (err instanceof NoteError) return NextResponse.json({ error: err.message }, { status: err.status, headers: noStore });
    console.error('[volta actions/note]', err);
    return NextResponse.json({ error: (err as Error).message || 'failed' }, { status: 500, headers: noStore });
  }
}
