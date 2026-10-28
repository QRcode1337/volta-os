import 'server-only';
import { HttpError } from '@/lib/server/http-error';
import { maskToken, redactSecrets } from '@/lib/server/redact';
import { honchoHttpError } from '@/lib/server/honcho';

/** Honcho ids: RESOURCE_NAME_PATTERN plus legacy '.' names and `scope.`-style prefixes. */
const ID_RE = /^[A-Za-z0-9_.:-]{1,512}$/;

// ── Secret masking ──
// Honcho keeps whatever agents saw, including API keys pasted into chats, and its deriver
// restates them in conclusions/representations. Every proxied response is masked here so a
// secret never reaches the screen (unvolta-ltm OCRs it) or the clipboard. Id fields are left
// untouched so navigation keeps working. The string masker lives in lib/server/redact.ts.

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

/** Awaits a Honcho call: its result comes back secret-masked, its errors as HttpError (see honchoHttpError). */
export async function fromHoncho<T>(call: Promise<T>): Promise<T> {
  try {
    return redactDeep(await call) as T;
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
