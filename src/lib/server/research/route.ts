import 'server-only';
import { NextResponse } from 'next/server';
import { rejectNonLocalRead } from '../local-only';
import { ResearchError } from './config';

/**
 * Like localJson (route-helpers.ts: loopback host + same-origin guard, no-store JSON) but honours the HTTP status of a
 * ResearchError (404 unknown id, 409 iCloud placeholder...). `load` may return a Response to send a non-200 itself.
 */
export function researchJson<T>(load: (req: Request) => Promise<T | Response> | T | Response) {
  return async function GET(req: Request) {
    const denied = rejectNonLocalRead(req);
    if (denied) return denied;
    try {
      const out = await load(req);
      if (out instanceof Response) return out;
      return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
      if (err instanceof ResearchError) return NextResponse.json({ error: err.message }, { status: err.status });
      console.error('[research api]', err);
      return NextResponse.json({ error: (err as Error).message || 'failed' }, { status: 500 });
    }
  };
}

export const notFound = (message: string) => NextResponse.json({ error: message }, { status: 404 });
