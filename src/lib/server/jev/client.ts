import 'server-only';
import { cacheGet, cacheKey, cacheSet, dedupe } from './cache';
import { recordCacheHit, recordError, recordRequest } from './telemetry';
import {
  JevError,
  type ChoiceAnswer,
  type JevAnswer,
  type JevCallMeta,
  type JevItem,
  type JevOp,
  type JevQuestion,
  type JevUsage,
  type JudgeInput,
  type JudgeResult,
  type NoulAnswer,
  type RankInput,
  type RankResult,
  type RouteInput,
  type RouteResult,
  type ScoreAnswer,
  type TriageInput,
  type TriageResult,
} from './types';

/**
 * Typed client for TypeSafe System One (Jev).
 *   POST {base}/v1/systemone   Authorization: Bearer <key>
 *   { model, state, questions: { id: {type, instructions, criteria} } }
 *   → { model, answers: { id: {type:'noul', noul} | {type:'choice', choice, confidence, probabilities} | {type:'score', score, confidence} },
 *       usage: { input_tokens, output_tokens } }      (only input tokens are billed: $0.042 / Mtok)
 * The key is read from TYPESAFE_JEV_API_KEY server-side and never logged, echoed or put in an error.
 */

const BASE_URL = (process.env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai').replace(/\/+$/, '');
const MODEL = process.env.VOLTA_JEV_MODEL || 'jev-latest';
export const DEFAULT_TIMEOUT_MS = 8_000;
const ITEM_BATCH = 8; // Jev accuracy drops as state grows; jevkit batches items in 8s
const PARALLEL = 4;
const ITEM_CHARS = 1_500;
const TEXT_CHARS = 8_000;

export const jevConfigured = (): boolean => Boolean(process.env.TYPESAFE_JEV_API_KEY?.trim());

// ── circuit breaker: when JEV is unreachable, fail fast instead of making every caller wait out the timeout ──
const breaker = (() => {
  const g = globalThis as typeof globalThis & { __voltaJevBreaker?: { fails: number; openUntil: number } };
  return (g.__voltaJevBreaker ??= { fails: 0, openUntil: 0 });
})();
const BREAKER_FAILS = 3;
const BREAKER_OPEN_MS = 30_000;

export function jevCircuit(): { open: boolean; retryInMs: number } {
  const left = breaker.openUntil - Date.now();
  return { open: left > 0, retryInMs: Math.max(0, left) };
}

function statusError(status: number): JevError {
  if (status === 401 || status === 403) return new JevError('auth', `JEV rejected the API key (${status})`, status);
  if (status === 429) return new JevError('rate_limited', 'JEV rate limited (429)', status);
  if (status === 400 || status === 413 || status === 415 || status === 422) return new JevError('bad_request', `JEV rejected the request (${status})`, status);
  return new JevError('server', `JEV server error (${status})`, status);
}

const retryable = (e: JevError) => e.code === 'rate_limited' || e.code === 'server' || e.code === 'network';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RawResponse {
  answers?: Record<string, JevAnswer>;
  usage?: Partial<JevUsage>;
}

async function post(state: unknown, questions: Record<string, JevQuestion>, timeoutMs: number): Promise<{ answers: Record<string, JevAnswer>; usage: JevUsage }> {
  const key = process.env.TYPESAFE_JEV_API_KEY?.trim();
  if (!key) throw new JevError('no_key', 'TYPESAFE_JEV_API_KEY is not set');
  if (jevCircuit().open) throw new JevError('circuit_open', 'JEV circuit open after repeated failures');
  const deadline = Date.now() + timeoutMs;
  let last: JevError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const left = deadline - Date.now();
    if (left < 500) break;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), left);
    try {
      const res = await fetch(`${BASE_URL}/v1/systemone`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ model: MODEL, state, questions }),
        signal: ctl.signal,
        redirect: 'error',
        cache: 'no-store',
      });
      if (!res.ok) throw statusError(res.status);
      const data = (await res.json()) as RawResponse;
      if (!data.answers || typeof data.answers !== 'object') throw new JevError('bad_response', 'JEV returned no answers');
      breaker.fails = 0;
      return { answers: data.answers, usage: { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0 } };
    } catch (e) {
      const err =
        e instanceof JevError
          ? e
          : (e as Error).name === 'AbortError'
            ? new JevError('timeout', `JEV timed out after ${timeoutMs}ms`)
            : new JevError('network', 'JEV unreachable');
      last = err;
      if (!retryable(err) || attempt === 1) break;
      await sleep(250);
    } finally {
      clearTimeout(timer);
    }
  }
  const err = last ?? new JevError('timeout', `JEV timed out after ${timeoutMs}ms`);
  if (err.code !== 'bad_request') {
    breaker.fails += 1;
    if (err.code === 'auth') breaker.openUntil = Date.now() + 5 * 60_000;
    else if (breaker.fails >= BREAKER_FAILS) breaker.openUntil = Date.now() + BREAKER_OPEN_MS;
  }
  recordError(err.code, err.message);
  throw err;
}

interface AskResult {
  answers: Record<string, JevAnswer>;
  meta: JevCallMeta;
}

/** One System One request with response cache + in-flight dedupe + telemetry. */
export async function ask(op: JevOp, state: unknown, questions: Record<string, JevQuestion>, opts: { timeoutMs?: number } = {}): Promise<AskResult> {
  const key = cacheKey({ m: MODEL, state, questions });
  const hit = cacheGet<{ answers: Record<string, JevAnswer> }>(key);
  if (hit) {
    recordCacheHit();
    return { answers: hit.answers, meta: { cached: true, latencyMs: 0, inputTokens: 0, costUsd: 0, requests: 0 } };
  }
  return dedupe(key, async () => {
    const t0 = performance.now();
    const { answers, usage } = await post(state, questions, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const latencyMs = performance.now() - t0;
    const costUsd = recordRequest(op, latencyMs, usage.input_tokens, usage.output_tokens);
    cacheSet(key, { answers });
    return { answers, meta: { cached: false, latencyMs: Math.round(latencyMs), inputTokens: usage.input_tokens, costUsd, requests: 1 } };
  });
}

// ── helpers ──
const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const clip = (s: string, max: number) => (s.length <= max ? s : Array.from(s).slice(0, max).join(''));
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const asChoice = (a: JevAnswer | undefined): ChoiceAnswer | null => (a && a.type === 'choice' ? a : null);
const asNoul = (a: JevAnswer | undefined): NoulAnswer | null => (a && a.type === 'noul' ? a : null);
const asScore = (a: JevAnswer | undefined): ScoreAnswer | null => (a && a.type === 'score' ? a : null);

const sumMeta = (metas: JevCallMeta[]): JevCallMeta => ({
  cached: metas.length > 0 && metas.every((m) => m.cached),
  latencyMs: metas.reduce((a, m) => Math.max(a, m.latencyMs), 0), // batches run in parallel
  inputTokens: metas.reduce((a, m) => a + m.inputTokens, 0),
  costUsd: metas.reduce((a, m) => a + m.costUsd, 0),
  requests: metas.reduce((a, m) => a + m.requests, 0),
});

async function pmap<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const chunk = <T>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// ── route: pick the best candidate for a task ──
export async function route(input: RouteInput, opts: { timeoutMs?: number } = {}): Promise<RouteResult> {
  const ids = Object.keys(input.candidates);
  if (!ids.length) throw new JevError('bad_request', 'route needs at least one candidate');
  if ('none' in input.candidates) throw new JevError('bad_request', '"none" is reserved');
  const { answers, meta } = await ask(
    'route',
    { task: clip(input.task, 6_000) },
    { pick: { type: 'choice', instructions: 'Which candidate best fits the task in `task`?', criteria: { ...input.candidates, none: 'None of the candidates fits this task' } } },
    opts,
  );
  const r = asChoice(answers.pick);
  if (!r) throw new JevError('bad_response', 'JEV returned no route answer');
  const ranking = Object.entries(r.probabilities ?? {})
    .filter(([id]) => id !== 'none')
    .sort((a, b) => b[1] - a[1])
    .slice(0, input.k ?? 3)
    .map(([id, p]) => ({ id, probability: round(p) }));
  const abstained = r.choice === 'none' || !isNum(r.confidence) || r.confidence < (input.minConfidence ?? 0.5);
  return { choice: abstained ? null : r.choice, guess: r.choice, abstained, confidence: round(r.confidence), ranking, meta };
}

// ── rank: order items by a criterion (one Score per item, batches of 8) ──
const DEFAULT_LEVELS = ['very low', 'low', 'medium', 'high', 'very high'];

export async function rank(input: RankInput, opts: { timeoutMs?: number } = {}): Promise<RankResult> {
  const items = input.items.filter((i) => i.text.trim());
  if (!items.length) throw new JevError('bad_request', 'rank needs at least one non-empty item');
  const levels = input.levels ?? DEFAULT_LEVELS;
  const parts = await pmap(chunk(items, ITEM_BATCH), PARALLEL, async (part) => {
    const qs: Record<string, JevQuestion> = {};
    part.forEach((_, i) => {
      qs[`s${i}`] = { type: 'score', instructions: `Rate \`items[${i}]\` on: ${input.criterion}`, criteria: levels };
    });
    const { answers, meta } = await ask('rank', { items: part.map((x) => clip(x.text, ITEM_CHARS)) }, qs, opts);
    return { meta, rows: part.map((x, i) => ({ id: x.id, a: asScore(answers[`s${i}`]) })) };
  });
  const rows = parts.flatMap((p) => p.rows);
  const scored = rows
    .filter((r) => r.a && isNum(r.a.score))
    .map((r) => ({ id: r.id, score: round(r.a!.score, 2), confidence: round(r.a!.confidence) }))
    .sort((a, b) => b.score - a.score);
  return {
    max: levels.length - 1,
    ranked: input.top ? scored.slice(0, input.top) : scored,
    unscored: rows.filter((r) => !r.a || !isNum(r.a.score)).map((r) => r.id),
    meta: sumMeta(parts.map((p) => p.meta)),
  };
}

// ── triage: one label per item (batches of 8) ──
export async function triage(input: TriageInput, opts: { timeoutMs?: number } = {}): Promise<TriageResult> {
  const items: JevItem[] = input.items.filter((i) => i.text.trim());
  if (!items.length) throw new JevError('bad_request', 'triage needs at least one non-empty item');
  if (Object.keys(input.labels).length < 2) throw new JevError('bad_request', 'triage needs at least two labels');
  const min = input.minConfidence ?? 0.5;
  const parts = await pmap(chunk(items, ITEM_BATCH), PARALLEL, async (part) => {
    const qs: Record<string, JevQuestion> = {};
    part.forEach((_, i) => {
      qs[`i${i}`] = { type: 'choice', instructions: `Which label best fits \`items[${i}]\`?`, criteria: input.labels };
    });
    const { answers, meta } = await ask('triage', { items: part.map((x) => clip(x.text, ITEM_CHARS)) }, qs, opts);
    return {
      meta,
      rows: part.map((x, i) => {
        const r = asChoice(answers[`i${i}`]);
        const sure = !!r && isNum(r.confidence) && r.confidence >= min;
        return { id: x.id, label: sure ? r!.choice : null, guess: r?.choice ?? null, confidence: round(r?.confidence ?? 0), probabilities: r?.probabilities ?? {} };
      }),
    };
  });
  return { results: parts.flatMap((p) => p.rows), meta: sumMeta(parts.map((p) => p.meta)) };
}

// ── judge: several yes/no checks over one text, one request ──
export async function judge(input: JudgeInput, opts: { timeoutMs?: number } = {}): Promise<JudgeResult> {
  if (!input.questions.length || input.questions.length > 20) throw new JevError('bad_request', 'judge takes 1–20 questions');
  const threshold = input.threshold ?? 0.5;
  const qs: Record<string, JevQuestion> = {};
  input.questions.forEach((q, i) => {
    qs[`q${i}`] = { type: 'noul', instructions: `${q} Judge only \`text\`.` };
  });
  const { answers, meta } = await ask('judge', { text: clip(input.text, TEXT_CHARS) }, qs, opts);
  const results = input.questions.map((question, i) => {
    const p = asNoul(answers[`q${i}`])?.noul;
    return { question, probability: isNum(p) ? round(p) : null, pass: isNum(p) && p >= threshold };
  });
  const incomplete = results.some((r) => r.probability === null);
  return { pass: !incomplete && results.every((r) => r.pass), incomplete, threshold, results, meta };
}
