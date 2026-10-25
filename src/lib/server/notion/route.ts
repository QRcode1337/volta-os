import 'server-only';
import { NextResponse } from 'next/server';
import { rejectNonLocalRead } from '../local-only';
import { NotionError } from './client';
import { NO_ACCESS_HINT } from './pages';

/** Last time each cache key was force-refreshed, so `?refresh=1` cannot be used to hammer Notion. */
const forced = ((globalThis as unknown as { __voltaNotionForce?: Map<string, number> }).__voltaNotionForce ??= new Map());
const FORCE_COOLDOWN_MS = 30_000;

export function allowForce(req: Request, key: string): boolean {
  if (new URL(req.url).searchParams.get('refresh') !== '1') return false;
  const last = forced.get(key) ?? 0;
  if (Date.now() - last < FORCE_COOLDOWN_MS) return false;
  forced.set(key, Date.now());
  return true;
}

export class BadRequest extends Error {}

/** GET wrapper for the Notion routes: localhost-only, same-origin, and Notion errors mapped to useful JSON. */
export function notionJson<T>(load: (req: Request) => Promise<T>) {
  return async function GET(req: Request) {
    const denied = rejectNonLocalRead(req);
    if (denied) return denied;
    try {
      return NextResponse.json(await load(req), { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
      if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400 });
      if (err instanceof NotionError) {
        if (err.code === 'not_configured') return NextResponse.json({ error: err.message, notConfigured: true }, { status: 503 });
        if (err.noAccess) return NextResponse.json({ error: 'Notion cannot see this page.', noAccess: true, hint: NO_ACCESS_HINT }, { status: 404 });
        return NextResponse.json({ error: err.message, code: err.code }, { status: err.status === 429 ? 429 : 502 });
      }
      console.error('[volta notion api]', err);
      return NextResponse.json({ error: (err as Error).message || 'failed' }, { status: 500 });
    }
  };
}
