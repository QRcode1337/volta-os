// PUT /api/carousels/state  { deckId, state: { status, edits, wildcard, pins } }  -> /Volumes/Windsor/VOLTA/carousels/state.json
// Localhost-only, same-origin, application/json. Writes the review state only; Notion is never written.
import { writeDeckState } from '@/lib/server/carousels/state';
import { route } from '@/lib/server/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = route(async ({ body }) => ({ ok: true, ...(await writeDeckState(String(body.deckId ?? ''), body.state)) }), { json: true, maxBytes: 512 * 1024 });
export const PUT = handler;
export const POST = handler;
