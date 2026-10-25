import 'server-only';
import { NextResponse } from 'next/server';

/** Error with an HTTP status that route handlers pass straight to the client (text is already safe to show). */
export class MusicError extends Error {
  constructor(
    message: string,
    public status = 500,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'MusicError';
  }
}

export function fail(err: unknown): NextResponse {
  const noStore = { 'Cache-Control': 'no-store' };
  if (err instanceof MusicError) return NextResponse.json({ error: err.message, ...err.extra }, { status: err.status, headers: noStore });
  console.error('[music api]', err);
  return NextResponse.json({ error: (err as Error)?.message || 'failed' }, { status: 500, headers: noStore });
}
