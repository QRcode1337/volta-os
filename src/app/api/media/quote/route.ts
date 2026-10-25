// POST /api/media/quote — validate a generation request and return an est. cost + short-lived quote id.
// Spends nothing. POST /api/media/generate {quoteId} is the only route that spends.
import { NextResponse } from 'next/server';
import { rejectNonLocalMutation } from '@/lib/server/local-only';
import { errorMessage, errorStatus } from '@/lib/server/media/config';
import { createQuote } from '@/lib/server/media/quotes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = rejectNonLocalMutation(req);
  if (denied) return denied;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  try {
    return NextResponse.json(await createQuote(raw), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: errorStatus(err) });
  }
}
