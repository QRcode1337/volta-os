import 'server-only';
import { NextResponse } from 'next/server';
import { rejectNonLocalMutation, rejectNonLocalRead } from '../local-only';
import { StudioError } from './storage';

const noStore = { 'Cache-Control': 'no-store' };

export function fail(err: unknown): NextResponse {
  if (err instanceof StudioError) return NextResponse.json({ error: err.message }, { status: err.status, headers: noStore });
  console.error('[studio api]', err);
  return NextResponse.json({ error: (err as Error)?.message || 'failed' }, { status: 500, headers: noStore });
}

/** GET handler wrapper: localhost-only + same-origin, JSON out, StudioError -> its status. */
export function studioGet(load: (req: Request) => Promise<unknown> | unknown) {
  return async function GET(req: Request) {
    const denied = rejectNonLocalRead(req);
    if (denied) return denied;
    try {
      return NextResponse.json(await load(req), { headers: noStore });
    } catch (err) {
      return fail(err);
    }
  };
}

/** POST handler wrapper: localhost + same-origin + application/json, small bounded JSON body. */
export function studioPost(run: (body: Record<string, unknown>, req: Request) => Promise<unknown> | unknown, opts: { maxBytes?: number } = {}) {
  const maxBytes = opts.maxBytes ?? 64 * 1024;
  return async function POST(req: Request) {
    const denied = rejectNonLocalMutation(req);
    if (denied) return denied;
    try {
      const text = await req.text();
      if (text.length > maxBytes) throw new StudioError('Request body too large.', 413);
      let body: unknown = {};
      if (text.trim()) {
        try {
          body = JSON.parse(text);
        } catch {
          throw new StudioError('Body must be valid JSON.', 400);
        }
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new StudioError('Body must be a JSON object.', 400);
      return NextResponse.json(await run(body as Record<string, unknown>, req), { headers: noStore });
    } catch (err) {
      return fail(err);
    }
  };
}
