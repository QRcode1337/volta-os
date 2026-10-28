import { HttpError, route } from '@/lib/server/route-helpers';
import { isIsoDate } from '@/lib/server/ltm';
import { listSessionNotes } from '@/lib/server/vaults';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pieces-Vault LTM session notes (Ollama summaries) for a day.
export const GET = route(
  async ({ url }) => {
    const date = url.searchParams.get('date');
    if (!isIsoDate(date)) throw new HttpError('date must be yyyy-mm-dd', 400);
    return { sessions: await listSessionNotes(date) };
  },
  { tag: 'ltm' },
);
