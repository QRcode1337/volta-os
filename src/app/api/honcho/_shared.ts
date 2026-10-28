import 'server-only';
import { HttpError } from '@/lib/server/http-error';
import { redactDeep } from '@/lib/server/redact';
import { honchoHttpError } from '@/lib/server/honcho';

/** Honcho ids: RESOURCE_NAME_PATTERN plus legacy '.' names and `scope.`-style prefixes. */
const ID_RE = /^[A-Za-z0-9_.:-]{1,512}$/;

/**
 * Awaits a Honcho call: its result comes back secret-masked (Honcho keeps whatever agents saw, and its deriver restates
 * pasted keys in conclusions; ids stay untouched so navigation works), its errors as HttpError (see honchoHttpError).
 */
export async function fromHoncho<T>(call: Promise<T>): Promise<T> {
  try {
    return redactDeep(await call);
  } catch (err) {
    throw honchoHttpError(err);
  }
}

/** Validates a Honcho id from a path segment / query value. */
export function idOf(v: string | null | undefined, name: string): string {
  // All-dot ids ('.', '..') would rewrite the upstream path after URL normalisation.
  if (v == null || !ID_RE.test(v) || /^\.+$/.test(v)) throw new HttpError(`invalid ${name}`, 400);
  return v;
}

export function optId(v: string | null | undefined, name: string): string | undefined {
  if (v == null || v === '') return undefined;
  return idOf(v, name);
}

export function isoOf(v: string | null, name: string): string | undefined {
  if (v == null || v === '') return undefined;
  if (v.length > 40 || Number.isNaN(Date.parse(v))) throw new HttpError(`invalid ${name}`, 400);
  return v;
}

export function textOf(v: unknown, name: string, max: number, required = true): string | undefined {
  if (v == null || v === '') {
    if (required) throw new HttpError(`${name} is required`, 400);
    return undefined;
  }
  if (typeof v !== 'string') throw new HttpError(`invalid ${name}`, 400);
  const t = v.trim();
  if (required && !t) throw new HttpError(`${name} is required`, 400);
  if (t.length > max) throw new HttpError(`${name} is too long (max ${max})`, 400);
  return t || undefined;
}
