import 'server-only';
import { NextResponse } from 'next/server';
import { rejectNonLocal } from '@/lib/server/local-only';
import { maskToken, redactSecrets } from '@/lib/server/redact';
import { HONCHO_URL, HonchoApiError, HonchoOfflineError, HonchoTimeoutError } from '@/lib/server/honcho';
import type { HonchoOfflineBody } from '@/types/honcho';

export const noStore = { 'Cache-Control': 'no-store' };

/** Honcho ids: RESOURCE_NAME_PATTERN plus legacy '.' names and `scope.`-style prefixes. */
const ID_RE = /^[A-Za-z0-9_.:-]{1,512}$/;

export class BadRequest extends Error {}

// ── Secret masking ──
// Honcho keeps whatever agents saw, including API keys pasted into chats, and its deriver
// restates them in conclusions/representations. Every proxied response is masked here so a
// secret never reaches the screen (unvolta-ltm OCRs it) or the clipboard. Id fields are left
// untouched so navigation keeps working. The masker itself lives in lib/server/redact.ts
// (shared with VOLTA Search and the LTM viewer); re-exported here for existing importers.

export { redactSecrets };
const SECRET_KEY_RE = /^[A-Za-z0-9_.-]*(?:api[ _-]?key|access[_-]?key|private[_-]?key|secret|token|password|passwd|pwd)$/i;
/** Fields that hold ids (never masked). */
const ID_KEY_RE = /^(?:id|.+_ids?)$/;

function redactDeep(v: unknown, key?: string): unknown {
  if (typeof v === 'string') {
    if (key && ID_KEY_RE.test(key)) return v;
    if (key && SECRET_KEY_RE.test(key) && v.length >= 8) return maskToken(v);
    return redactSecrets(v);
  }
  if (Array.isArray(v)) return v.map((x) => redactDeep(x, key));
  if (v && typeof v === 'object') {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = redactDeep(x, k);
    return out;
  }
  return v;
}

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(redactDeep(data), { status, headers: noStore });
}

export function badRequest(message: string): NextResponse {
  return json({ error: message }, 400);
}

/** Validates a Honcho id from a path segment / query value. */
export function idOf(v: string | null | undefined, name: string): string {
  // All-dot ids ('.', '..') would rewrite the upstream path after URL normalisation.
  if (v == null || !ID_RE.test(v) || /^\.+$/.test(v)) throw new BadRequest(`invalid ${name}`);
  return v;
}

export function optId(v: string | null | undefined, name: string): string | undefined {
  if (v == null || v === '') return undefined;
  return idOf(v, name);
}

export function intOf(v: string | null, name: string, def: number, min: number, max: number): number {
  if (v == null || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new BadRequest(`invalid ${name}`);
  return n;
}

export function isoOf(v: string | null, name: string): string | undefined {
  if (v == null || v === '') return undefined;
  if (v.length > 40 || Number.isNaN(Date.parse(v))) throw new BadRequest(`invalid ${name}`);
  return v;
}

export function textOf(v: unknown, name: string, max: number, required = true): string | undefined {
  if (v == null || v === '') {
    if (required) throw new BadRequest(`${name} is required`);
    return undefined;
  }
  if (typeof v !== 'string') throw new BadRequest(`invalid ${name}`);
  const t = v.trim();
  if (required && !t) throw new BadRequest(`${name} is required`);
  if (t.length > max) throw new BadRequest(`${name} is too long (max ${max})`);
  return t || undefined;
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  // JSON-only: a cross-site page can send text/plain or form bodies without a CORS preflight.
  if (!/^application\/json\b/i.test(req.headers.get('content-type') ?? '')) throw new BadRequest('expected Content-Type: application/json');
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > 64_000) throw new BadRequest('body too large');
  const body = (await req.json().catch(() => null)) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequest('expected a JSON object body');
  return body as Record<string, unknown>;
}

export function honchoError(err: unknown): NextResponse {
  if (err instanceof BadRequest) return badRequest(err.message);
  if (err instanceof HonchoOfflineError) {
    const body: HonchoOfflineBody = { error: err.message, offline: true, url: HONCHO_URL };
    return json(body, 503);
  }
  if (err instanceof HonchoTimeoutError) return json({ error: err.message, timeout: true }, 504);
  if (err instanceof HonchoApiError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    // A 503 from Honcho itself (e.g. DB not ready) is not "offline"; surface as a gateway error.
    return json({ error: err.message, upstreamStatus: err.status }, status === 503 ? 502 : status);
  }
  if ((err as Error)?.name === 'AbortError') return json({ error: 'cancelled' }, 499);
  console.error('[honcho]', err);
  return json({ error: (err as Error)?.message ?? 'Honcho request failed' }, 500);
}

/**
 * CSRF / drive-by guard. The Host check alone passes a request that another website makes to
 * http://127.0.0.1:50000 (e.g. a no-preflight POST, or an <img> hitting stats?fresh=1).
 * Rejects when the browser says the request came from another site, or when an Origin header
 * is present and is not this origin. Direct navigation (Sec-Fetch-Site: none) and curl pass.
 */
function rejectCrossSite(req: Request): NextResponse | null {
  const site = req.headers.get('sec-fetch-site');
  let ok = site !== 'cross-site' && site !== 'same-site';
  const origin = req.headers.get('origin');
  if (ok && origin != null) {
    try {
      ok = new URL(origin).host === (req.headers.get('host') ?? '').toLowerCase();
    } catch {
      ok = false; // "null" (sandboxed iframe, file://) or garbage
    }
  }
  return ok ? null : NextResponse.json({ error: 'Cross-site requests to private memory routes are refused.' }, { status: 403, headers: noStore });
}

/**
 * Wraps a handler with the local-only + same-origin guards and uniform error mapping.
 * Every /api/honcho route goes through this.
 */
export function handle<C>(fn: (req: Request, ctx: C) => Promise<NextResponse>) {
  return async (req: Request, ctx: C): Promise<NextResponse> => {
    const denied = rejectNonLocal(req) ?? rejectCrossSite(req);
    if (denied) return denied;
    try {
      return await fn(req, ctx);
    } catch (err) {
      return honchoError(err);
    }
  };
}

export type Params<T> = { params: Promise<T> };
