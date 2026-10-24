import { NextResponse } from 'next/server';
import { getCapture } from '@/lib/server/ltm';
import { rejectNonLocalRead } from '@/lib/server/local-only';
import { intParam, ltmError, noStore } from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  const id = intParam((await params).id);
  if (id == null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  try {
    const capture = getCapture(id);
    if (!capture) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(capture, { headers: noStore });
  } catch (err) {
    return ltmError(err);
  }
}
