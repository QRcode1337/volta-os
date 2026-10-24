import { NextResponse } from 'next/server';
import { isIsoDate } from '@/lib/server/ltm';
import { listSessionNotes } from '@/lib/server/vaults';
import { rejectNonLocalRead } from '@/lib/server/local-only';
import { noStore } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pieces-Vault LTM session notes (Ollama summaries) for a day.
export async function GET(req: Request) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  const date = new URL(req.url).searchParams.get('date');
  if (!isIsoDate(date)) return NextResponse.json({ error: 'date must be yyyy-mm-dd' }, { status: 400 });
  return NextResponse.json({ sessions: await listSessionNotes(date) }, { headers: noStore });
}
