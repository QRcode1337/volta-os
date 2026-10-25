import 'server-only';
import { NextResponse } from 'next/server';
import { rejectNonLocalMutation } from '../local-only';
import { MusicError, fail } from './errors';

/** PUT handler wrapper: localhost + same-origin + application/json, small bounded JSON object body. */
export function musicPut(run: (body: Record<string, unknown>) => Promise<unknown> | unknown, opts: { maxBytes?: number } = {}) {
  const maxBytes = opts.maxBytes ?? 256 * 1024;
  return async function PUT(req: Request) {
    const denied = rejectNonLocalMutation(req);
    if (denied) return denied;
    try {
      const text = await req.text();
      if (text.length > maxBytes) throw new MusicError('Request body too large.', 413);
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new MusicError('Body must be valid JSON.', 400);
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MusicError('Body must be a JSON object.', 400);
      return NextResponse.json(await run(body as Record<string, unknown>), { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
      return fail(err);
    }
  };
}
