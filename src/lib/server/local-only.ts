import 'server-only';
import { NextResponse } from 'next/server';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Guard for routes that expose private data (screen OCR, vault notes).
 * Rejects requests whose Host header isn't loopback — blocks LAN access if the
 * server is ever bound to 0.0.0.0, and DNS-rebinding from web pages.
 * Returns a 403 response to send, or null when the request is allowed.
 */
export function rejectNonLocal(req: Request): NextResponse | null {
  const host = (req.headers.get('host') ?? '').toLowerCase();
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  if (LOCAL_HOSTS.has(hostname)) return null;
  return NextResponse.json({ error: 'Private memory routes are only served to localhost.' }, { status: 403 });
}

/**
 * Same-origin check (CSRF / drive-by reads). A browser always sends Origin on POST/PUT and Sec-Fetch-Site on
 * modern engines, so a page on another site (or another localhost port: that is "same-site") is refused, even
 * for an <img>/<script> GET such as `?refresh=1`. Same-origin fetches (`same-origin`), typed URLs and bookmarks
 * (`none`), and curl / other local tools (no header at all) are allowed.
 */
export function rejectCrossSite(req: Request): NextResponse | null {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    return NextResponse.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  }
  const origin = req.headers.get('origin');
  if (origin !== null) {
    let ok = false;
    try {
      const u = new URL(origin);
      ok = LOCAL_HOSTS.has(u.hostname.toLowerCase()) && u.host.toLowerCase() === (req.headers.get('host') ?? '').toLowerCase();
    } catch {
      ok = false; // "null" (sandboxed iframe, file://) or malformed
    }
    if (!ok) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  }
  return null;
}

/** Guard for private GET routes: loopback Host plus the same-origin check above. */
export function rejectNonLocalRead(req: Request): NextResponse | null {
  return rejectNonLocal(req) ?? rejectCrossSite(req);
}

/**
 * Guard for routes that write to ./workspace or start processes: loopback Host, same-origin browser
 * request, and an application/json body (a cross-site form or text/plain fetch can't send one without
 * a CORS preflight, which this server never approves).
 */
export function rejectNonLocalMutation(req: Request): NextResponse | null {
  const denied = rejectNonLocalRead(req);
  if (denied) return denied;
  const type = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') {
    return NextResponse.json({ error: 'Content-Type must be application/json.' }, { status: 415 });
  }
  return null;
}
