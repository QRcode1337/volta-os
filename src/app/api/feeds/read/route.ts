import { NextResponse } from 'next/server';
import { rejectNonLocalMutation } from '@/lib/server/local-only';
import { markRead } from '@/lib/server/feeds';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST /api/feeds/read  { ids?: string[], source?: string, all?: boolean, read?: boolean }  -> { changed, persisted, reason? } */
export async function POST(req: Request) {
  const denied = rejectNonLocalMutation(req);
  if (denied) return denied;
  try {
    const b = (await req.json().catch(() => ({}))) as { ids?: unknown; source?: unknown; all?: unknown; read?: unknown };
    const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === 'string').slice(0, 500) : undefined;
    const source = typeof b.source === 'string' ? b.source : undefined;
    if (!ids?.length && !source && b.all !== true) return NextResponse.json({ error: 'Pass ids, source or all.' }, { status: 400 });
    const res = await markRead({ ids, source, all: b.all === true, read: b.read !== false });
    return NextResponse.json(res, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[volta feeds]', err);
    return NextResponse.json({ error: (err as Error).message || 'failed' }, { status: 500 });
  }
}
