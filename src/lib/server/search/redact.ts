// Secret masking for everything VOLTA Search returns (titles, snippets, meta labels, notes).
//
// Dependency-free on purpose (no 'server-only', no aliases) so `redact.test.ts` can run it under plain Node, and so
// the Honcho proxy (src/app/api/honcho/_shared.ts), the transcript masker (sources/sessions.ts) and the LTM viewer
// can adopt the same rules: this is a superset of both of those maskers.
//
// Search results are shown on screen, where unvolta-ltm OCRs them again, so the rules are tuned for OCR'd text too:
// keys split by OCR-inserted spaces ("sk-ant-api03- uADY85g_…- xG5S…"), OCR typos in variable names
// ("ANTHROPIC_APL_KEY"), stray non-ASCII letters inside a key ("…GaÚ1eb…"), and the tail of a key left over after
// an earlier rule masked only its first piece.

export const MASK = '••••';
/** Longest span (chars, OCR spaces included) a single masked key may cover. */
const MAX_KEY = 160;

const isKeyChar = (c: string | undefined): boolean => !!c && /[\p{L}\p{N}_-]/u.test(c);
const isSep = (c: string | undefined): boolean => c === '-' || c === '_';

function entropy(s: string): number {
  if (!s) return 0;
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let e = 0;
  for (const n of counts.values()) e -= (n / s.length) * Math.log2(n / s.length);
  return e;
}

/** digit↔letter adjacencies: random keys have many, words / dates / slugs have few. */
const digitLetterBoundaries = (s: string): number => s.match(/\d(?=\p{L})|\p{L}(?=\d)/gu)?.length ?? 0;

/** A chunk of key material rather than a word: digits mixed with letters, or upper case after the first letter. */
function chunkLooksKey(c: string, min: number): boolean {
  const s = c.replace(/^[-_]+|[-_]+$/g, '');
  if (s.length < min) return false;
  if (/^\p{Ll}+$/u.test(s) || /^\p{Lu}\p{Ll}+$/u.test(s) || /^\p{Lu}+$/u.test(s) || /^\d+$/.test(s)) return false;
  const digitAndLetter = /\d/.test(s) && /\p{L}/u.test(s);
  const innerUpper = /.\p{Lu}/u.test(s) && /\p{Ll}/u.test(s);
  return digitAndLetter || innerUpper;
}

/** A 20+ char run (separators ignored) that reads as random: not hex (hashes, UUIDs), not a slug, not camelCase. */
export function looksRandom(run: string, minBoundaries = 4, minEntropy = 3.9): boolean {
  const s = run.replace(/[-_\s]/g, '');
  if (s.length < 16) return false;
  if (/^[0-9a-f]+$/i.test(s) || !/\d/.test(s) || !/\p{L}/u.test(s)) return false;
  return digitLetterBoundaries(s) >= minBoundaries && entropy(s) >= minEntropy;
}

/**
 * End (exclusive) of the key whose material continues at `from`: key chars, `:`/`.` joins followed by 8+ key
 * chars, and single OCR spaces in front of a chunk that is clearly more key (after a `-`/`_` split, or a chunk
 * that looks random by itself). Capped at `start + MAX_KEY`.
 */
function scanKey(text: string, from: number, start: number): number {
  const max = Math.min(text.length, start + MAX_KEY);
  let i = from;
  for (;;) {
    while (i < max && isKeyChar(text[i])) i++;
    // `sk-1m-abc:def…` / `SG.abc.def` joins
    if (i < max && (text[i] === ':' || text[i] === '.')) {
      let j = i + 1;
      while (j < max && isKeyChar(text[j])) j++;
      if (j - (i + 1) >= 8) {
        i = j;
        continue;
      }
    }
    // One OCR-inserted space, then more key.
    if (i < max - 1 && (text[i] === ' ' || text[i] === ' ') && isKeyChar(text[i + 1])) {
      let j = i + 1;
      while (j < max && isKeyChar(text[j])) j++;
      const chunk = text.slice(i + 1, j);
      const split = isSep(text[i - 1]) || isSep(chunk[0]);
      if (split ? chunkLooksKey(chunk, 4) : chunkLooksKey(chunk, 8)) {
        i = j;
        continue;
      }
    }
    return i;
  }
}

/** `<visible>••••(<length>)`; `visible` is a vendor prefix or nothing. */
const label = (visible: string, length: number) => `${visible}${MASK}(${length})`;

/** Generic token mask: first 4 chars of a 24+ char token stay visible so it can be recognised, never more. */
export function maskToken(t: string): string {
  return label(t.length >= 24 ? t.slice(0, 4) : '', t.length);
}

// ── Vendor-prefixed keys (with OCR-split continuations) ──
// Anthropic, OpenAI (project / service account / admin), OpenRouter, Stripe, AgentMail, GitHub, Slack, Google,
// AWS, Hugging Face, GitLab, Notion, Groq, xAI, Replicate, Pinecone, Perplexity, Tavily, NVIDIA, LangSmith,
// Supabase, npm, PyPI, DigitalOcean, Shopify, Cerebras, Google OAuth, SendGrid.
const PREFIXES = [
  String.raw`sk-ant-(?:api|oat|admin|sid)\d{2}-`,
  'sk-proj-',
  'sk-svcacct-',
  'sk-admin-',
  'sk-or-v1-',
  'sk_live_',
  'sk_test_',
  'rk_live_',
  'rk_test_',
  'whsec_',
  'sk-',
  'sk_',
  'rk_',
  'am_',
  'github_pat_',
  'gh[pousr]_',
  'xox[abeprs]-',
  'xapp-',
  'AIza',
  'AKIA',
  'ASIA',
  'hf_',
  'glpat-',
  'ntn_',
  'secret_',
  'gsk_',
  'xai-',
  'r8_',
  'pcsk_',
  'pplx-',
  'tvly-',
  'nvapi-',
  'lsv2_(?:pt|sk)_',
  'sbp_',
  'npm_',
  'pypi-',
  'do[opr]_v1_',
  'shp(?:at|ss|ca|pa)_',
  'csk-',
  String.raw`ya29\.`,
  String.raw`SG\.`,
];
const PREFIX_RE = new RegExp(String.raw`(?<![\p{L}\p{N}_])(?:${PREFIXES.join('|')})`, 'gu');

function maskPrefixed(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(PREFIX_RE)) {
    const start = m.index ?? 0;
    if (start < last) continue;
    const prefix = m[0];
    const end = scanKey(text, start + prefix.length, start);
    const body = text.slice(start + prefix.length, end).replace(/[\s\-_:.]/g, '');
    // Vendor key bodies are random base62/64: digits mixed into letters, or heavy mixed case. Spares identifiers
    // that merely start like a prefix ("hf_hub_download", "sk_2fa_enabled", "secret_manager").
    const upper = body.match(/\p{Lu}/gu)?.length ?? 0;
    const lower = body.match(/\p{Ll}/gu)?.length ?? 0;
    const randomish = digitLetterBoundaries(body) >= 2 || (upper >= 3 && lower >= 2 && /.\p{Lu}/u.test(body));
    // `sk-` keys made of words (LiteLLM master keys like "sk-something-master") are masked too, from 12 chars.
    const wordySk = prefix === 'sk-' && body.length >= 12;
    if (body.length >= 10 && (randomish || wordySk)) {
      out += text.slice(last, start) + label(prefix.length <= 13 ? prefix : prefix.slice(0, 13), end - start);
      last = end;
    }
  }
  return last ? out + text.slice(last) : text;
}

// ── NAME=value assignments, headers, flags, URL credentials ──
// OCR reads "API" as "APL"/"AP1"/"APl", so the key-name pattern accepts those too.
const SECRET_NAME = String.raw`[A-Za-z0-9_.-]*(?:ap[il1|][ _-]?key|access[_-]?key|private[_-]?key|secret|token|password|passwd|pwd)`;
const ASSIGN_RE = new RegExp(String.raw`(?<![A-Za-z0-9_])(${SECRET_NAME})(["']?[ \t]*[=:][ \t]*["']?)([^\s"'\`,;)]{8,})`, 'gi');
const ENV_SECRET_RE =
  /(?<![\p{L}\p{N}_])([A-Z][A-Z0-9_]*(?:_KEY|_KEYS|_TOKEN|_SECRET|_PASS|_PASSWORD|_PWD|_AUTH|_CREDENTIALS?|KEY_[A-Z0-9]{1,4}))(\s*[=:]\s*["']?)([^\s"'`,;)]{8,})/gu;
const AUTH_HEADER_RE = /(\bauthorization["']?\s*[:=]\s*["']?)(?:(basic|bearer|token|digest|apikey)\s+)?([A-Za-z0-9._~+/=:$-]{8,})/gi;
const BEARER_RE = /\b(Bearer\s+)([A-Za-z0-9._~+/:$-]{16,}=*)/g;
const FLAG_SECRET_RE = /(--(?:password|passwd|pass|token|api[-_]?key|secret|auth[-_]token|access[-_]token|client[-_]secret)(?:=|\s+)["']?)([^\s"'`]{6,})/gi;
const URL_CRED_RE = /(\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s:@/"'`]{1,64}:)([^\s@/"'`]{3,})(@)/gi;
const PEM_RE = /-----BEGIN ([A-Z ]*PRIVATE KEY)-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

/** `$VAR` / `${VAR}` references are not secrets. */
const isVarRef = (v: string) => /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/.test(v);
const alreadyMasked = (v: string) => v.includes(MASK);
/** `apiKey: process.env.OPENAI_API_KEY` names where the secret lives; it is not the secret. */
const isCodeRef = (v: string) => /^(?:process\.env|import\.meta\.env|os\.environ|env)[.[]/.test(v);

/** Mask a value that starts at `valueStart`, extending it over OCR-split continuations. */
function maskValueAt(text: string, re: RegExp, valueGroup: number, skip: (value: string, m: RegExpMatchArray) => boolean): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(re)) {
    const value = m[valueGroup];
    if (!value) continue;
    const start = (m.index ?? 0) + m[0].length - value.length;
    if (start < last || skip(value, m) || alreadyMasked(value)) continue;
    const end = Math.max(start + value.length, scanKey(text, start + value.length, start));
    out += text.slice(last, start) + maskToken(text.slice(start, end));
    last = end;
  }
  return last ? out + text.slice(last) : text;
}

// ── Prefix-less key shapes ──
/** `bk_us1_<random>` style: short lower-case prefix, short region/version part, random tail. */
const SHORT_PREFIX_3_RE = /(?<![\p{L}\p{N}_])[a-z]{2,6}_[A-Za-z0-9]{2,6}_[A-Za-z0-9]{16,}/gu;
/** `ab_<random 24+>` */
const SHORT_PREFIX_2_RE = /(?<![\p{L}\p{N}_])[a-z]{2,5}_[A-Za-z0-9]{24,}/gu;
/** X/Twitter-style access token: numeric user id, `-`, random tail. */
const DIGITS_DASH_RE = /(?<![\p{L}\p{N}_])\d{6,}-[A-Za-z0-9]{24,}/gu;
/** Any 24+ run of key chars; masked only when it reads as random. */
const LONG_RUN_RE = /[A-Za-z0-9_-]{24,}/g;

/** The random part of a `prefix_…` match. */
const tail = (m: string) => m.slice(m.lastIndexOf('_') + 1);

function maskShape(text: string, re: RegExp, test: (m: string) => boolean): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start < last || !test(m[0])) continue;
    const end = scanKey(text, start + m[0].length, start);
    out += text.slice(last, start) + maskToken(text.slice(start, end));
    last = end;
  }
  return last ? out + text.slice(last) : text;
}

// ── Leftovers next to a mask ──
const MASK_LABEL_RE = /([^\s•]*)••••\((\d+)\)/g;

/** A key whose first piece was masked keeps its OCR-split tail: absorb it into the mask. */
function absorbTails(text: string): string {
  if (!text.includes(MASK)) return text;
  let out = '';
  let last = 0;
  for (const m of text.matchAll(MASK_LABEL_RE)) {
    const start = m.index ?? 0;
    const labelEnd = start + m[0].length;
    let end = labelEnd;
    while (end < text.length && isKeyChar(text[end])) end++;
    let grown = end - labelEnd;
    for (;;) {
      if (!((text[end] === ' ' || text[end] === ' ') && isKeyChar(text[end + 1]))) break;
      let j = end + 1;
      while (j < text.length && isKeyChar(text[j])) j++;
      const chunk = text.slice(end + 1, j);
      const split = isSep(text[end - 1]) || isSep(chunk[0]);
      const ok = split ? chunkLooksKey(chunk, 4) : chunkLooksKey(chunk, 8);
      if (!ok || grown + (j - end) > MAX_KEY) break;
      grown += j - end;
      end = j;
    }
    if (end === labelEnd) continue;
    out += text.slice(last, start) + label(m[1], Number(m[2]) + (end - labelEnd));
    last = end;
  }
  return last ? out + text.slice(last) : text;
}

/** Mask every secret-looking token in `text`. Idempotent; never throws. */
export function redact(text: string): string {
  if (!text || text.length < 8) return text;
  let t = text.replace(PEM_RE, (_m, kind: string) => `-----BEGIN ${kind}----- ${MASK} -----END ${kind}-----`);
  t = t.replace(JWT_RE, (m) => maskToken(m));
  t = maskPrefixed(t);
  t = maskValueAt(t, ENV_SECRET_RE, 3, (v) => isVarRef(v) || /^[a-z]+$/i.test(v));
  t = maskValueAt(t, ASSIGN_RE, 3, (v) => isVarRef(v) || isCodeRef(v) || /^[A-Za-z]+$/.test(v));
  t = maskValueAt(t, AUTH_HEADER_RE, 3, (v) => isVarRef(v));
  t = maskValueAt(t, BEARER_RE, 2, (v) => isVarRef(v));
  t = maskValueAt(t, FLAG_SECRET_RE, 2, (v) => isVarRef(v));
  t = t.replace(URL_CRED_RE, (m, pre: string, pass: string, at: string) => (alreadyMasked(pass) || isVarRef(pass) ? m : `${pre}${maskToken(pass)}${at}`));
  t = maskShape(t, SHORT_PREFIX_3_RE, (m) => looksRandom(tail(m), 2, 3.3));
  t = maskShape(t, SHORT_PREFIX_2_RE, (m) => looksRandom(tail(m), 3, 3.6));
  t = maskShape(t, DIGITS_DASH_RE, (m) => {
    const r = m.slice(m.indexOf('-') + 1);
    return /\p{L}/u.test(r) && (/\d/.test(r) || (/\p{Lu}/u.test(r) && /\p{Ll}/u.test(r))) && entropy(r) >= 3.6;
  });
  t = maskShape(t, LONG_RUN_RE, (m) => looksRandom(m));
  return absorbTails(t);
}
