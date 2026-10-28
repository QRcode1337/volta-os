// GET /api/carousels[?refresh=1]  decks built from the Shorts/TikTok pages in Notion + the saved review state (Windsor)
import { getDecks } from '@/lib/server/carousels/decks';
import { STATE_FILE, readState } from '@/lib/server/carousels/state';
import { refreshOpts } from '@/lib/server/notion/route';
import { route } from '@/lib/server/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async ({ req }) => {
  const [payload, state] = await Promise.all([getDecks(refreshOpts(req)), readState()]);
  return { ...payload, state: state.doc, storage: { available: state.available, reason: state.reason, file: STATE_FILE } };
});
