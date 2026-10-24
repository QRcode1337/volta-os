import { NextResponse } from 'next/server';
import { getAppCounts, isIsoDate } from '@/lib/server/ltm';
import { rejectNonLocalRead } from '@/lib/server/local-only';
import { ltmError, noStore } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  const date = new URL(req.url).searchParams.get('date');
  if (date && !isIsoDate(date)) return NextResponse.json({ error: 'date must be yyyy-mm-dd' }, { status: 400 });
  try {
    return NextResponse.json({ apps: getAppCounts(date ?? undefined) }, { headers: noStore });
  } catch (err) {
    return ltmError(err);
  }
}
