import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { rejectNonLocalRead } from '../local-only';
import { feedToken } from './config';

// Guard for the two routes podcast apps fetch directly (feed.xml, file, cover).
//
// The existing guards accept the tailnet host only when `Tailscale-User-Login` matches, and Apple Podcasts never sends
// that header. So these routes accept EITHER a valid secret token in the URL (`?token=`) OR the normal local guard
// (the in-app player). Either way the Host header must still be loopback or the configured tailnet host, which keeps
// DNS-rebinding and stray LAN hosts out. The token is compared in constant time; repeated bad guesses are throttled.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const TAILNET_HOST = (process.env.VOLTA_TAILNET_HOST ?? '').toLowerCase();

const g = globalThis as unknown as { __podcastAuthFails?: { n: number; since: number } };

const hostnameOf = (req: Request): string => {
  const host = (req.headers.get('host') ?? '').toLowerCase();
  return host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
};

const digest = (s: string) => createHash('sha256').update(s).digest();

export function feedTokenOk(supplied: string | null | undefined): boolean {
  const want = feedToken();
  if (want.length < 32 || !supplied) return false; // fail closed: no token configured (or a weak one) means no token access
  return timingSafeEqual(digest(supplied), digest(want));
}

const deny = (status: number, msg: string) => NextResponse.json({ error: msg }, { status, headers: { 'Cache-Control': 'no-store' } });

/** Returns a response to send when the request is NOT allowed, or null when it is. */
export function authorizeFeedRequest(req: Request): NextResponse | null {
  const host = hostnameOf(req);
  if (!LOCAL_HOSTS.has(host) && !(TAILNET_HOST && host === TAILNET_HOST)) return deny(403, 'Forbidden');
  const supplied = new URL(req.url).searchParams.get('token');
  if (supplied && feedTokenOk(supplied)) return null;
  if (rejectNonLocalRead(req) === null) return null; // in-app request (loopback or tailnet login, same-origin)
  const now = Date.now();
  const f = (g.__podcastAuthFails ??= { n: 0, since: now });
  if (now - f.since > 60_000) {
    f.n = 0;
    f.since = now;
  }
  f.n += 1;
  if (f.n > 30) return deny(429, 'Too many attempts');
  return deny(403, 'Forbidden');
}

/** Headers for token-bearing responses: keep the URL out of Referer headers and search indexes. */
export const PRIVATE_HEADERS = { 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' } as const;
