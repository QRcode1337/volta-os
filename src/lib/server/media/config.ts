import 'server-only';
import { HttpError } from '../http-error';
import { redactSecrets } from '../redact';

/** Everything generated lands here (external drive). Nothing is ever written to the boot disk. */
export const MOUNT_POINT = '/Volumes/Windsor';
export const GEN_ROOT = '/Volumes/Windsor/VOLTA/generations';
export const MANIFEST_PATH = `${GEN_ROOT}/manifest.jsonl`;
/** "Export" copies land here, one new folder per export (same drive as the generations). */
export const EXPORT_ROOT = '/Volumes/Windsor/VOLTA/exports';
export const MIN_FREE_BYTES = 2 * 1024 ** 3;

/** Refuse any single request estimated above this (USD). Override with VOLTA_GEN_MAX_USD. */
export const MAX_REQUEST_USD = Number(process.env.VOLTA_GEN_MAX_USD) > 0 ? Number(process.env.VOLTA_GEN_MAX_USD) : 5;
/**
 * Refuse any paid generation that would push today's recorded spend (local calendar day; Generations manifest +
 * podcast TTS) over this (USD). Override with VOLTA_GEN_DAILY_USD. Enforced at quote time and again at generate time.
 */
export const DAILY_CAP_USD = Number(process.env.VOLTA_GEN_DAILY_USD) > 0 ? Number(process.env.VOLTA_GEN_DAILY_USD) : 20;
export const QUOTE_TTL_MS = 5 * 60 * 1000;

export const xaiKey = () => (process.env.XAI_API_KEY ?? '').trim();
export const elevenKey = () => (process.env.ELEVENLABS_API_KEY ?? '').trim();
export const geminiKey = () => (process.env.GEMINI_API_KEY ?? '').trim();

/** Mask the live API keys plus anything the shared secret masker recognises. Use on ALL upstream error text. */
export function maskSecrets(text: string): string {
  let out = text;
  for (const k of [xaiKey(), elevenKey(), geminiKey()]) if (k.length >= 8) out = out.split(k).join('[key]');
  return redactSecrets(out);
}

/** Safe text for any error: HttpError text as-is (already masked), timeouts named, anything else secret-masked. */
export function errorMessage(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  const e = err as { name?: string; message?: string };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'Upstream request timed out.';
  return maskSecrets(e?.message || 'failed');
}

/** The media area's one mapping to HttpError: HttpError passes through, anything else is a 500 with masked text. */
export function toHttpError(err: unknown): HttpError {
  return err instanceof HttpError ? err : new HttpError(errorMessage(err), 500);
}
