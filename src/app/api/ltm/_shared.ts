import 'server-only';
import { NextResponse } from 'next/server';
import { LtmUnavailableError } from '@/lib/server/ltm';

export function ltmError(err: unknown): NextResponse {
  if (err instanceof LtmUnavailableError) {
    return NextResponse.json({ error: err.message, unavailable: true }, { status: 503 });
  }
  console.error('[ltm]', err);
  return NextResponse.json({ error: (err as Error).message ?? 'LTM query failed' }, { status: 500 });
}

export function intParam(v: string | null): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

export const noStore = { 'Cache-Control': 'no-store' };
