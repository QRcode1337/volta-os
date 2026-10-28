import 'server-only';
import { HttpError } from '../http-error';
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

/**
 * Rethrow a Notion failure as the HttpError the routes answer with (anything else is rethrown unchanged), so a route
 * can write `getCatalog(...).catch(notionHttp)`: not configured -> 503 {notConfigured}, not shared with the integration
 * -> 404 {noAccess, hint}, rate limited -> 429 {code}, any other Notion failure -> 502 {code}.
 */
export function notionHttp(err: unknown): never {
  if (!(err instanceof NotionError)) throw err;
  if (err.code === 'not_configured') throw new HttpError(err.message, 503, { notConfigured: true });
  if (err.noAccess) throw new HttpError('Notion cannot see this page.', 404, { noAccess: true, hint: NO_ACCESS_HINT });
  throw new HttpError(err.message, err.status === 429 ? 429 : 502, { code: err.code });
}
