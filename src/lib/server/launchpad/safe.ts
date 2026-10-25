import 'server-only';
import { redactSecrets } from '../redact';

/** Returns the URL string only when it is plain http(s) (never javascript:, data:, file:). */
export function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** A short, secret-masked message safe to hand to the browser. */
export function safeMessage(err: unknown, max = 200): string {
  const m = err instanceof Error ? err.message : String(err);
  return redactSecrets(m.replace(/\s+/g, ' ').trim()).slice(0, max);
}
