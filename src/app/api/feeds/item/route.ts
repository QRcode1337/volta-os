import { NextResponse } from 'next/server';
import { rejectNonLocalRead } from '@/lib/server/local-only';
import { getFeedItem } from '@/lib/server/feeds';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/feeds/item?id=  -> the full item (markdown body, already secret-masked). */
export async function GET(req: Request) {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  try {
    const id = new URL(req.url).searchParams.get('id') ?? '';
    const item = id ? await getFeedItem(id) : null;
    if (!item) return NextResponse.json({ error: 'Feed item not found (it may have rolled out of the retention window).' }, { status: 404 });
    return NextResponse.json(item, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[volta feeds]', err);
    return NextResponse.json({ error: (err as Error).message || 'failed' }, { status: 500 });
  }
}
