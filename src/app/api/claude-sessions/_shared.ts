import 'server-only';
import { NextResponse } from 'next/server';
import { rejectNonLocalRead } from '@/lib/server/local-only';
import { SESSION_ID_RE } from '@/lib/server/sources/sessions';

// Same guard as localJson (localhost Host + same-origin), plus 400 for bad params and 404 for unknown sessions.
// Payloads are masked by the loaders in lib/server/sources/sessions.ts.

export const noStore = { 'Cache-Control': 'no-store' };

export class BadRequest extends Error {}

/** Integer query param within [min, max]; empty → default. */
export function intParam(v: string | null, name: string, def: number, min: number, max: number): number {
  if (v == null || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new BadRequest(`invalid ${name}`);
  return n;
}

async function respond<T>(load: () => Promise<T | null>, notFound: string): Promise<NextResponse> {
  try {
    const body = await load();
    if (body == null) return NextResponse.json({ error: notFound }, { status: 404, headers: noStore });
    return NextResponse.json(body, { headers: noStore });
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: err.message }, { status: 400, headers: noStore });
    console.error('[volta sessions]', err);
    return NextResponse.json({ error: (err as Error).message || 'failed' }, { status: 500, headers: noStore });
  }
}

/** GET handler for a private, non-parameterised route. */
export function privateRoute<T>(load: (req: Request) => Promise<T | null>) {
  return async function GET(req: Request) {
    const denied = rejectNonLocalRead(req);
    if (denied) return denied;
    return respond(() => load(req), 'not found');
  };
}

/** GET handler for /api/claude-sessions/[id]/… with a validated id. */
export function sessionRoute<T>(load: (req: Request, id: string) => Promise<T | null>) {
  return async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const denied = rejectNonLocalRead(req);
    if (denied) return denied;
    const { id } = await params;
    if (!SESSION_ID_RE.test(id)) return NextResponse.json({ error: 'invalid session id' }, { status: 400, headers: noStore });
    return respond(() => load(req, id), 'session not found');
  };
}
