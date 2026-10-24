import { NextResponse } from 'next/server';
import { isIsoDate, listCaptures } from '@/lib/server/ltm';
import { rejectNonLocalRead } from '@/lib/server/local-only';
import { intParam, ltmError, noStore } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/ltm/captures?date=yyyy-mm-dd&app=Safari&q=text&from=1&to=9&limit=200&offset=0&order=desc
export async function GET(req: Request) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const date = sp.get('date');
  if (date && !isIsoDate(date)) return NextResponse.json({ error: 'date must be yyyy-mm-dd' }, { status: 400 });
  const q = sp.get('q')?.trim() || undefined;
  if (q && q.length > 200) return NextResponse.json({ error: 'q too long' }, { status: 400 });
  const order = sp.get('order') === 'asc' ? 'asc' : 'desc';
  try {
    const result = listCaptures({
      date: date ?? undefined,
      app: sp.get('app') || undefined,
      q,
      from: intParam(sp.get('from')),
      to: intParam(sp.get('to')),
      limit: intParam(sp.get('limit')),
      offset: intParam(sp.get('offset')),
      order,
    });
    return NextResponse.json(result, { headers: noStore });
  } catch (err) {
    return ltmError(err);
  }
}
