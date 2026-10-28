// GET /api/actions/note?path=wiki/main/concepts/x.md -> WikiNote
//   Read-only text of a wiki note the Tasks board links to (only files under ~/.openclaw/wiki), so the note can be
//   read in VOLTA on the phone instead of copying a Mac `open` command.
import { route } from '@/lib/server/route-helpers';
import { readWikiNote } from '@/lib/server/sources/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(({ url }) => readWikiNote(url.searchParams.get('path') ?? ''), { tag: 'volta actions/note' });
