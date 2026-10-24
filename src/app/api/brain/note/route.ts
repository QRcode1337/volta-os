import { localJson } from '@/lib/server/route-helpers';
import { readNote } from '@/lib/server/sources/notes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = localJson(async (req) => {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const note = await readNote(id);
  return note ? { id, content: note.content, exists: true } : { id, content: '', exists: false };
});
