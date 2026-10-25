// GET /api/carousels[?refresh=1]  decks built from the Shorts/TikTok pages in Notion + the saved review state (Windsor)
import { NextResponse } from 'next/server';
import { getDecks } from '@/lib/server/carousels/decks';
import { STATE_FILE, readState } from '@/lib/server/carousels/state';
import { rejectNonLocalRead } from '@/lib/server/local-only';
import { NotionError } from '@/lib/server/notion/client';
import { allowForce } from '@/lib/server/notion/route';
import { fail } from '@/lib/server/studio/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  try {
    const [payload, state] = await Promise.all([getDecks({ force: allowForce(req, 'carousels') }), readState()]);
    return NextResponse.json({ ...payload, state: state.doc, storage: { available: state.available, reason: state.reason, file: STATE_FILE } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof NotionError && err.code === 'not_configured') return NextResponse.json({ error: err.message, notConfigured: true }, { status: 503 });
    return fail(err);
  }
}
