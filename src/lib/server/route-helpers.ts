import 'server-only';
import { NextResponse } from 'next/server';
import { rejectNonLocalRead } from './local-only';
import { LtmUnavailableError } from './ltm';

/** GET handler wrapper for private JSON routes: localhost-only and same-origin (see rejectNonLocalRead). */
export function localJson<T>(load: (req: Request) => Promise<T> | T) {
  return async function GET(req: Request) {
    const denied = rejectNonLocalRead(req);
    if (denied) return denied;
    try {
      return NextResponse.json(await load(req), { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
      if (err instanceof LtmUnavailableError) {
        return NextResponse.json({ error: err.message, unavailable: true }, { status: 503 });
      }
      console.error('[volta api]', err);
      return NextResponse.json({ error: (err as Error).message || 'failed' }, { status: 500 });
    }
  };
}
