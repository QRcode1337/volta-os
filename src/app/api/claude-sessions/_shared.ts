import 'server-only';
import { HttpError } from '@/lib/server/http-error';
import { SESSION_ID_RE } from '@/lib/server/sources/sessions';

// Payloads are masked by the loaders in lib/server/sources/sessions.ts.

/** Validated session id from the [id] segment (400 otherwise). */
export function sessionIdOf(id: string): string {
  if (!SESSION_ID_RE.test(id)) throw new HttpError('invalid session id', 400);
  return id;
}

