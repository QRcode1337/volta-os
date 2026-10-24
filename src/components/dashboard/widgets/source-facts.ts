// Extra facts on a Memory Sources row, read defensively.
//
// The base MemorySource contract is id/name/status/headline/detail/href/external/setupHint, plus the optional
// `metrics` (SourceMetric[]: Honcho workspaces/peers/sessions, claude-mem observations/sessions/summaries,
// Pieces-Vault notes / captures waiting / summarized-through id, LTM captures/apps) and `checkedAt`, both read
// explicitly below. Any other extra field a row carries is still shown, without depending on its exact name:
//   - number / string / boolean      → one fact ("messages 1,879")
//   - ISO timestamp string            → a fact rendered relative to the client clock ("12m ago")
//   - [{ label, value, tone? }]       → one fact per item (tone: ok | warn | bad)
//   - array of primitives             → one fact, values joined with " · "
//   - plain object                    → its fields, one level deep ("honcho messages", or just "messages" under
//                                       a generic container key such as `stats` / `counts` / `details`)
// Extra-field keys that look like credentials/config (token, key, secret, password, pwd, dsn, connection string,
// auth, cookie, env, args, headers, …) are never shown; the server's own `metrics[].label` is not name-filtered,
// so a "tokens" metric still shows. Every string value is also passed through maskSecrets (sk-…, ghp_…, xox?-…,
// AKIA…, JWTs, long mixed-case key runs, user:password@ in URLs, NAME_KEY=value) before it is displayed.
// Metrics whose label names an id ("summarized through capture", "… id", or the server's kind/format 'id') render
// as "#12577", not as a count.

import type { MemorySource } from '@/types/sources';
import { formatInt } from '@/lib/format';

export type FactTone = 'ok' | 'warn' | 'bad';

export interface SourceFact {
  key: string; // stable React key
  label: string;
  value: string;
  /** Qualifier from the server, e.g. "lower bound" (SourceMetric.note). */
  note?: string;
  /** Set when the value is an ISO timestamp: render it relative to the client clock. */
  iso?: string;
  tone?: FactTone;
}

const BASE_KEYS = new Set<string>(['id', 'name', 'status', 'headline', 'detail', 'href', 'external', 'setupHint', 'metrics', 'checkedAt']);
/** Container keys whose children read better without the container's name as a prefix. */
const GENERIC_KEYS = new Set<string>(['stats', 'counts', 'details', 'detail', 'extra', 'extras', 'meta', 'metrics', 'facts', 'info', 'data']);
/** Words that mark a key as a credential wherever they appear in it ("clientSecret", "authMode", "dbPwd"). */
const SECRET_ANY = new Set([
  'secret', 'secrets', 'password', 'passwd', 'passphrase', 'pwd', 'cookie', 'cookies', 'bearer', 'credential',
  'credentials', 'jwt', 'dsn', 'auth', 'authorization', 'apikey', 'accesskey', 'secretkey', 'privatekey',
]);
/** Words that mark a key only as its last word ("accessToken", "licenseKey", "headers" — not "tokenCount"). */
const SECRET_LAST = new Set(['token', 'key', 'keys', 'env', 'args', 'argv', 'header', 'headers', 'signature']);
/** All-lowercase compounds with no word boundary to split on ("sessionkey", "connectionstring"). */
const SECRET_JOINED = /(apikey|accesskey|secretkey|privatekey|licensekey|sessionkey|authtoken|accesstoken|refreshtoken|password|passwd)$|conn(ection)?str(ing)?/;

const keyWords = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** True for an extra-field key that names a credential or raw config. */
export function isSecretKey(key: string): boolean {
  const w = keyWords(key);
  if (w.length === 0) return false;
  if (w.some((x) => SECRET_ANY.has(x)) || SECRET_LAST.has(w[w.length - 1])) return true;
  return SECRET_JOINED.test(w.join(''));
}

const MASK = '••••';
/** Value shapes that are credentials whatever key they sit under. */
const SECRET_VALUE_RES: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/g, // OpenAI / Anthropic style
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bAIza[0-9A-Za-z_-]{30,}/g, // Google API key
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+)?/g, // JWT
];
const URL_CREDS_RE = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi;
const ASSIGN_RE = /\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD))(\s*[=:]\s*)["']?([^\s"']{6,})/gi;
const LONG_RUN_RE = /[A-Za-z0-9_+=-]{40,}/g; // no '/' so file paths survive

/** Mask credential-looking substrings in display text (client-side, defence in depth over the server's own masking). */
export function maskSecrets(text: string): string {
  if (text.length < 8) return text;
  let out = text.replace(URL_CREDS_RE, `$1${MASK}@`);
  for (const re of SECRET_VALUE_RES) out = out.replace(re, MASK);
  out = out.replace(ASSIGN_RE, (m, name: string, sep: string, value: string) => (value.includes(MASK) ? m : `${name}${sep}${MASK}`));
  return out.replace(LONG_RUN_RE, (m) => (/\d/.test(m) && /[a-z]/.test(m) && /[A-Z]/.test(m) ? MASK : m));
}

/** An id-like metric (a capture/row id, not a count): server kind/format 'id', or a label that says so. */
const ID_LABEL_RE = /\bid\b|\bthrough\b|#/i;
function isIdMetric(m: { label: string; kind?: unknown; format?: unknown }): boolean {
  return m.kind === 'id' || m.format === 'id' || ID_LABEL_RE.test(m.label);
}
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const MAX_FACTS = 12;
const MAX_DEPTH = 2;
const MAX_STR = 160;

function humanize(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
}

function toneOf(v: unknown): FactTone | undefined {
  return v === 'ok' || v === 'warn' || v === 'bad' ? v : undefined;
}

function fmt(v: unknown): { value: string; iso?: string } | null {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    return { value: Number.isInteger(v) ? formatInt(v) : String(Math.round(v * 100) / 100) };
  }
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return null;
    if (ISO_RE.test(t) && Number.isFinite(Date.parse(t))) return { value: t, iso: t };
    const safe = maskSecrets(t);
    return { value: safe.length > MAX_STR ? `${safe.slice(0, MAX_STR - 1)}…` : safe };
  }
  if (typeof v === 'boolean') return { value: v ? 'yes' : 'no' };
  return null;
}

function isFactItem(x: unknown): x is { label: unknown; value: unknown; tone?: unknown } {
  return !!x && typeof x === 'object' && !Array.isArray(x) && 'label' in x && 'value' in x;
}

/** When the server last probed this row (ISO), or null when absent/unparseable. */
export function checkedAtOf(source: MemorySource): string | null {
  const v = (source as { checkedAt?: unknown }).checkedAt;
  return typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null;
}

/** Facts for a row: its `metrics` first (in server order), then any other extra fields. Empty for a base-only row. */
export function sourceFacts(source: MemorySource): SourceFact[] {
  const out: SourceFact[] = [];
  const metrics: unknown = (source as { metrics?: unknown }).metrics;
  if (Array.isArray(metrics)) {
    metrics.forEach((m, i) => {
      // Server-authored labels: not name-filtered (a "tokens" metric is a count), values still go through fmt/mask.
      if (!isFactItem(m) || typeof m.label !== 'string' || !m.label.trim()) return;
      const label = maskSecrets(m.label.trim());
      const idLike = typeof m.value === 'number' && Number.isInteger(m.value) && isIdMetric({ ...(m as object), label });
      const f = idLike ? { value: `#${m.value as number}` } : fmt(m.value);
      if (!f || out.length >= MAX_FACTS) return;
      const rawNote: unknown = (m as { note?: unknown }).note;
      const note = typeof rawNote === 'string' && rawNote.trim() ? maskSecrets(rawNote.trim()) : undefined;
      out.push({ key: `metrics.${i}.${m.label}`, label, ...f, note, tone: toneOf(m.tone) });
    });
  }

  const walk = (key: string, label: string, v: unknown, depth: number) => {
    if (out.length >= MAX_FACTS || v === null || v === undefined) return;
    const leaf = key.slice(key.lastIndexOf('.') + 1);
    if (isSecretKey(leaf)) return;
    if (Array.isArray(v)) {
      if (v.length && v.every(isFactItem)) {
        for (const item of v) {
          const f = fmt(item.value);
          if (f && typeof item.label === 'string' && item.label.trim() && out.length < MAX_FACTS && !isSecretKey(item.label)) {
            out.push({ key: `${key}.${item.label}`, label: maskSecrets(item.label.trim()), ...f, tone: toneOf(item.tone) });
          }
        }
        return;
      }
      const values = v.map(fmt).filter((f): f is NonNullable<ReturnType<typeof fmt>> => !!f);
      if (values.length) out.push({ key, label: label || humanize(leaf), value: values.map((f) => f.value).join(' · ') });
      return;
    }
    if (typeof v === 'object') {
      if (depth >= MAX_DEPTH) return;
      const obj = v as Record<string, unknown>;
      // A single { value, label?, tone? } object reads as one fact.
      if ('value' in obj && fmt(obj.value)) {
        const f = fmt(obj.value)!;
        const named = typeof obj.label === 'string' && obj.label.trim() ? maskSecrets(obj.label.trim()) : label || humanize(leaf);
        out.push({ key, label: named, ...f, tone: toneOf(obj.tone) });
        return;
      }
      for (const [k, x] of Object.entries(obj)) {
        walk(`${key}.${k}`, GENERIC_KEYS.has(leaf) || !label ? humanize(k) : `${label} ${humanize(k)}`, x, depth + 1);
      }
      return;
    }
    const f = fmt(v);
    if (f) out.push({ key, label: label || humanize(leaf), ...f });
  };

  for (const [k, v] of Object.entries(source as unknown as Record<string, unknown>)) {
    if (!BASE_KEYS.has(k)) walk(k, GENERIC_KEYS.has(k) ? '' : humanize(k), v, 0);
  }
  return out;
}

/** "just now" · "12m ago" · "3h ago" · "4d ago" (client-only: needs the live clock). */
export function relativeAgo(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const mins = Math.round((nowMs - t) / 60_000);
  if (mins < 0) return 'in the future';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}
