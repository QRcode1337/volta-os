import { NextResponse } from 'next/server';
import { getStatus } from '@/lib/server/ltm';
import { rejectNonLocalRead } from '@/lib/server/local-only';
import { noStore } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  return NextResponse.json(getStatus(), { headers: noStore });
}
