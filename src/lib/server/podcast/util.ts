import 'server-only';
import { redactSecrets } from '../redact';
import { feedToken, geminiKey } from './config';

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);
export const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar date, YYYY-MM-DD. */
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Mask live keys plus anything the shared secret masker recognises. Use on ALL upstream error text and logged strings. */
export function maskSecrets(text: string): string {
  let out = text;
  for (const k of [geminiKey(), feedToken()]) if (k.length >= 8) out = out.split(k).join('[key]');
  return redactSecrets(out);
}
export const errMsg = (e: unknown): string => maskSecrets((e as Error)?.message || String(e) || 'failed');

/** Run `fn` over `items` with at most `limit` in flight. Results keep input order. */
export async function pmap<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/**
 * Pull the JSON value out of an LLM reply that may wrap it in prose or a code fence.
 * Tries the whole text, then fenced blocks, then the last balanced top-level array/object.
 */
export function extractJson(text: string): unknown {
  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  const whole = tryParse(text.trim());
  if (whole !== undefined) return whole;
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const v = tryParse(m[1].trim());
    if (v !== undefined) return v;
  }
  // last balanced [...] or {...}
  let found: unknown;
  for (let i = 0; i < text.length; i++) {
    const open = text[i];
    if (open !== '[' && open !== '{') continue;
    const close = open === '[' ? ']' : '}';
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close && --depth === 0) {
        const v = tryParse(text.slice(i, j + 1));
        if (v !== undefined) {
          found = v;
          i = j;
        }
        break;
      }
    }
  }
  return found;
}

const TRACKING = /^(utm_|fbclid|gclid|mc_|ref$|ref_|source$|cmpid|ocid|taid)/i;
/** Canonical form of a URL for de-duplication (no scheme/www/fragment/tracking params/trailing slash). Empty for invalid input. */
export function normUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const keep = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
    const q = keep.length ? `?${keep.map(([k, v]) => `${k}=${v}`).join('&')}` : '';
    let p = u.pathname.replace(/\/+$/, '');
    if (host === 'arxiv.org') p = p.replace(/v\d+$/, ''); // abs/2510.01234v2 -> abs/2510.01234
    return `${host}${p}${q}`;
  } catch {
    return '';
  }
}
export const isHttpUrl = (s: unknown): s is string => typeof s === 'string' && /^https?:\/\/[^\s]+$/i.test(s.trim());

const STOP = new Set('a an the of to in on for and or with by from at as is are was were be been this that these those its it new says say after over into about how why what who will can could may might not no more most than via vs using use used based'.split(' '));
export function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export const stripHtml = (s: string): string =>
  s
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

export const escXml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
