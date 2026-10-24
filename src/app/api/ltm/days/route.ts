import { NextResponse } from 'next/server';
import { getDays } from '@/lib/server/ltm';
import { rejectNonLocalRead } from '@/lib/server/local-only';
import { ltmError, noStore } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  try {
    const top = Math.min(Math.max(Number(new URL(req.url).searchParams.get('top')) || 6, 1), 40);
    return NextResponse.json({ days: getDays(top) }, { headers: noStore });
  } catch (err) {
    return ltmError(err);
  }
}
