import 'server-only';
import { redactSecrets } from '../redact';
import type { Range } from './types';

// Query parsing, match highlighting and secret-safe snippet windows shared by every search source.

export const MAX_QUERY_CHARS = 200;
const MAX_TERMS = 8;
const MAX_RANGES = 40;
/** Masking runs on this much text around the match, so a window edge never cuts a secret in half unmasked. */
const MASK_MARGIN = 600;


export interface ParsedQuery {
  /** Whitespace-collapsed query as typed. */
  q: string;
  /** Lower-cased q. */
  phrase: string;
  /** Unique lower-cased words, longest first (so the highlight alternation prefers the longest match). */
  terms: string[];
  /** Any term, case-insensitive, global. Null for an empty query. */
  termRe: RegExp | null;
  /** The whole phrase with flexible whitespace, case-insensitive. Null for an empty query. */
  phraseRe: RegExp | null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseQuery(raw: string): ParsedQuery {
  const q = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_CHARS);
  const phrase = q.toLowerCase();
  const terms = [...new Set(phrase.split(' ').filter(Boolean))].sort((a, b) => b.length - a.length).slice(0, MAX_TERMS);
  return {
    q,
    phrase,
    terms,
    termRe: terms.length ? new RegExp(terms.map(escapeRe).join('|'), 'giu') : null,
    phraseRe: phrase ? new RegExp(escapeRe(phrase).replace(/ /g, '\\s+'), 'iu') : null,
  };
}

/** Merged [start, end) ranges of every term occurrence in `text`. */
export function highlightRanges(text: string, re: RegExp | null): Range[] {
  if (!re || !text) return [];
  const out: Range[] = [];
  for (const m of text.matchAll(re)) {
    const s = m.index ?? 0;
    const e = s + m[0].length;
    if (e === s) continue;
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
    if (out.length >= MAX_RANGES) break;
  }
  return out;
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

function firstMatch(t: string, pq: ParsedQuery): number {
  const p = pq.phraseRe?.exec(t);
  if (p) return p.index;
  if (!pq.termRe) return -1;
  pq.termRe.lastIndex = 0;
  const m = pq.termRe.exec(t);
  pq.termRe.lastIndex = 0;
  return m ? m.index : -1;
}

/** Window of ~`size` chars around the first match (phrase first, else any term), snapped to word boundaries. */
function windowOf(t: string, at: number, size: number): [number, number] {
  if (t.length <= size) return [0, t.length];
  if (at < 0) {
    const sp = t.lastIndexOf(' ', size);
    return [0, sp > size * 0.6 ? sp : size];
  }
  let start = Math.max(0, at - Math.floor(size * 0.3));
  if (start > 0) {
    const sp = t.indexOf(' ', start);
    if (sp >= 0 && sp < at) start = sp + 1;
  }
  let end = Math.min(t.length, start + size);
  if (end < t.length) {
    const sp = t.lastIndexOf(' ', end);
    if (sp > at) end = sp;
  }
  return [start, end];
}

export interface Snippet {
  text: string;
  highlights: Range[];
}

/**
 * Secret-masked, whitespace-collapsed excerpt of `raw` centred on the first match, with highlight ranges.
 * Masking runs on a wide region before the window is cut, so a partially visible key is still masked.
 */
export function makeSnippet(raw: string | null | undefined, pq: ParsedQuery, size = 220): Snippet {
  const full = collapse(raw ?? '');
  if (!full) return { text: '', highlights: [] };
  const at0 = firstMatch(full, pq);
  const regionStart = full.length > MASK_MARGIN * 3 ? Math.max(0, (at0 < 0 ? 0 : at0) - MASK_MARGIN) : 0;
  const regionEnd = full.length > MASK_MARGIN * 3 ? Math.min(full.length, (at0 < 0 ? 0 : at0) + MASK_MARGIN * 2) : full.length;
  const region = redactSecrets(full.slice(regionStart, regionEnd));
  const [s, e] = windowOf(region, firstMatch(region, pq), size);
  const text = (s > 0 || regionStart > 0 ? '…' : '') + region.slice(s, e).trim() + (e < region.length || regionEnd < full.length ? '…' : '');
  return { text, highlights: highlightRanges(text, pq.termRe) };
}

/** Masked single-line title with highlight ranges. */
export function makeTitle(raw: string, pq: ParsedQuery, max = 160): Snippet {
  let t = redactSecrets(collapse(raw));
  if (t.length > max) t = `${t.slice(0, max - 1)}…`;
  return { text: t, highlights: highlightRanges(t, pq.termRe) };
}

/** True when every term occurs in at least one of `fields` (all lower-cased). */
export function allTermsIn(terms: string[], ...fields: (string | null | undefined)[]): boolean {
  return terms.every((t) => fields.some((f) => !!f && f.includes(t)));
}

/** Simple name/description score: phrase in name ≫ term in name ≫ term in other fields. */
export function nameScore(pq: ParsedQuery, name: string, ...other: (string | null | undefined)[]): number {
  const n = name.toLowerCase();
  let s = 0;
  if (n === pq.phrase) s += 100;
  else if (n.startsWith(pq.phrase)) s += 60;
  else if (n.includes(pq.phrase)) s += 40;
  for (const t of pq.terms) {
    if (n.includes(t)) s += 10;
    else if (other.some((o) => o?.toLowerCase().includes(t))) s += 2;
  }
  return s;
}

export class SourceTimeout extends Error {}

/** Race `p` against `ms`. The underlying work keeps running (and fills its caches) after a timeout. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new SourceTimeout(`no answer within ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
