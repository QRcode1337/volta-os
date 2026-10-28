import 'server-only';
import { NextResponse } from 'next/server';
import { HttpError } from './http-error';
import { rejectNonLocalMutation, rejectNonLocalRead } from './local-only';
import { redactDeep } from './redact';

export { HttpError };

export const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** `{ error }` JSON for any thrown value: HttpError keeps its status and extra fields, anything else is a logged 500. */
export function errorResponse(err: unknown, tag = 'volta api'): NextResponse {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message, ...err.extra }, { status: err.status, headers: NO_STORE });
  console.error(`[${tag}]`, err);
  return NextResponse.json({ error: (err as Error)?.message || 'failed' }, { status: 500, headers: NO_STORE });
}

export interface RouteInput<P> {
  req: Request;
  /** Resolved dynamic segments ({} for static routes). */
  params: P;
  /** Parsed JSON object body; {} unless the route was declared with `json`. */
  body: Record<string, unknown>;
  url: URL;
}

export interface RouteOptions {
  /** Writes or starts work: require same-origin + application/json (rejectNonLocalMutation) instead of the read guard. */
  mutation?: boolean;
  /** Parse a JSON object body (implies mutation). An empty body is {}. */
  json?: boolean;
  /** Body cap in bytes when `json` (default 64 KB). */
  maxBytes?: number;
  /** Log tag for unexpected errors. */
  tag?: string;
  /** Pass the JSON result through redactDeep before sending (for payloads built from captured text). */
  redact?: boolean;
}

/**
 * The single route wrapper: localhost / tailnet guard, optional bounded JSON body, `no-store` JSON out (optionally
 * secret-masked), HttpError -> its status. Return a Response (file stream, SSE, redirect) to send it untouched.
 */
export function route<P extends Record<string, string> = Record<string, never>>(
  handler: (input: RouteInput<P>) => unknown,
  opts: RouteOptions = {},
) {
  const mutation = opts.mutation || opts.json;
  const maxBytes = opts.maxBytes ?? 64 * 1024;
  return async function handle(req: Request, ctx?: { params?: Promise<P> | P }): Promise<Response> {
    const denied = mutation ? rejectNonLocalMutation(req) : rejectNonLocalRead(req);
    if (denied) return denied;
    try {
      let body: Record<string, unknown> = {};
      if (opts.json) body = await readJsonObject(req, maxBytes);
      const params = ((await ctx?.params) ?? {}) as P;
      const out = await handler({ req, params, body, url: new URL(req.url) });
      if (out instanceof Response) return out;
      return NextResponse.json(opts.redact ? redactDeep(out) : out, { headers: NO_STORE });
    } catch (err) {
      return errorResponse(err, opts.tag);
    }
  };
}

async function readJsonObject(req: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) throw new HttpError(`Request body larger than ${Math.round(maxBytes / 1024)} KB.`, 413);
  if (!text.trim()) return {};
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError('Body must be valid JSON.', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError('Body must be a JSON object.', 400);
  return body as Record<string, unknown>;
}

/** Integer query param in [min, max]; `fallback` when absent, 400 when present but invalid. */
export function intParam(url: URL, name: string, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback }: { min?: number; max?: number; fallback?: number } = {}): number | undefined {
  const v = url.searchParams.get(name);
  if (v == null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(`invalid ${name}`, 400);
  return n;
}
