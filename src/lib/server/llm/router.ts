import 'server-only';
import { chat, chatStream } from './client';
import { chainFor, LOCAL_TARGET, loadRoutes } from './config';
import { logUsage } from './usage-log';
import {
  LlmError,
  type Answerer,
  type Attempt,
  type ChatMessage,
  type ChatRequest,
  type CompleteRequest,
  type CompleteResult,
  type CompleteStreamEvent,
  type RoutesConfig,
  type TaskRoute,
} from './types';

// Task router. A VOLTA task (config/llm-routes.json) maps to a chain of OmniRoute combos; the first target that
// answers wins and the local LM Studio model is the last resort. Selecting a combo = sending its name as the
// OpenAI `model`. OmniRoute does the per-member fallback inside a combo; this layer only moves on when the whole
// combo failed (or timed out / answered empty).

export class TaskError extends Error {
  constructor(
    readonly code: 'unknown_task' | 'bad_request' | 'all_failed',
    message: string,
    readonly attempts: Attempt[] = [],
  ) {
    super(message);
    this.name = 'TaskError';
  }
}

function gatewayBase(cfg: RoutesConfig): string {
  const override = process.env[cfg.gateway.baseUrlEnv]?.trim();
  if (!override) return cfg.gateway.baseUrl;
  const u = override.replace(/\/+$/, '');
  return /\/v1$/.test(u) ? u : `${u}/v1`;
}

const gatewayKey = (cfg: RoutesConfig): string | undefined => process.env[cfg.gateway.keyEnv]?.trim() || undefined;

export function validateMessages(cfg: RoutesConfig, messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) throw new TaskError('bad_request', 'messages must be a non-empty array');
  if (messages.length > cfg.limits.maxMessages) throw new TaskError('bad_request', `at most ${cfg.limits.maxMessages} messages`);
  let chars = 0;
  const out: ChatMessage[] = [];
  for (const m of messages) {
    const o = m as Partial<ChatMessage> | null;
    if (!o || (o.role !== 'system' && o.role !== 'user' && o.role !== 'assistant') || typeof o.content !== 'string') {
      throw new TaskError('bad_request', 'each message needs a role (system|user|assistant) and string content');
    }
    chars += o.content.length;
    out.push({ role: o.role, content: o.content });
  }
  if (chars > cfg.limits.maxChars) throw new TaskError('bad_request', `messages exceed ${cfg.limits.maxChars} characters`);
  if (!out.some((m) => m.role === 'user')) throw new TaskError('bad_request', 'at least one user message is required');
  return out;
}

interface Plan {
  cfg: RoutesConfig;
  task: string;
  route: TaskRoute;
  messages: ChatMessage[];
  chain: string[];
  maxTokens: number;
  timeoutMs: number;
}

function plan(req: CompleteRequest): Plan {
  const cfg = loadRoutes();
  const route = cfg.tasks[req.task];
  if (!route) throw new TaskError('unknown_task', `unknown task "${req.task}"; known: ${Object.keys(cfg.tasks).join(', ')}`);
  const messages = validateMessages(cfg, req.messages);
  const clamp = (v: unknown, d: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), max) : d);
  return {
    cfg,
    task: req.task,
    route,
    messages,
    chain: chainFor(route),
    maxTokens: clamp(req.maxTokens, route.maxTokens, cfg.limits.maxOutputTokens),
    timeoutMs: clamp(req.timeoutMs, route.timeoutMs, cfg.limits.maxTimeoutMs),
  };
}

/** The ChatRequest for one chain target. Local gets its own model, URL, a longer timeout and a thinking-sized token floor. */
function requestFor(p: Plan, target: string, req: CompleteRequest): { chatReq: ChatRequest; via: 'omniroute' | 'local' } | { skip: LlmError } {
  if (target === LOCAL_TARGET) {
    return {
      via: 'local',
      chatReq: {
        baseUrl: p.cfg.local.baseUrl,
        model: p.cfg.local.model,
        messages: p.messages,
        maxTokens: Math.max(p.maxTokens, p.cfg.local.minMaxTokens),
        temperature: req.temperature,
        timeoutMs: Math.max(p.timeoutMs, p.cfg.local.timeoutMs),
        signal: req.signal,
      },
    };
  }
  const key = gatewayKey(p.cfg);
  if (!key) return { skip: new LlmError('no_key', `${p.cfg.gateway.keyEnv} is not set`) };
  return {
    via: 'omniroute',
    chatReq: { baseUrl: gatewayBase(p.cfg), apiKey: key, model: target, messages: p.messages, maxTokens: p.maxTokens, temperature: req.temperature, timeoutMs: p.timeoutMs, signal: req.signal },
  };
}

function suspect(cfg: RoutesConfig, who: Answerer): boolean {
  const names = [who.provider, who.model?.split('/')[0]].filter((s): s is string => !!s).map((s) => s.toLowerCase());
  return names.some((n) => cfg.apiBilledProviders.includes(n));
}

function record(p: Plan, a: Attempt, idx: number, stream: boolean, extra: Partial<Answerer> & { ttfbMs?: number; tokensIn?: number; tokensOut?: number; suspect?: boolean } = {}): void {
  logUsage({
    ts: new Date().toISOString(),
    task: p.task,
    target: a.target,
    via: a.via,
    ok: a.ok,
    stream,
    attempt: idx,
    ms: a.ms,
    ttfbMs: extra.ttfbMs,
    status: a.status,
    model: extra.model,
    provider: extra.provider,
    connection: extra.connection,
    requestId: extra.requestId,
    tokensIn: extra.tokensIn,
    tokensOut: extra.tokensOut,
    error: a.error,
    skipped: a.skipped,
    apiBilledSuspect: extra.suspect || undefined,
  });
}

const failed = (target: string, via: 'omniroute' | 'local', ms: number, err: LlmError, skipped = false): Attempt => ({
  target,
  via,
  ok: false,
  skipped: skipped || undefined,
  status: err.status,
  ms,
  error: { kind: err.kind, message: err.message },
});

function toLlmError(err: unknown): LlmError {
  return err instanceof LlmError ? err : new LlmError('server', (err as Error)?.message?.slice(0, 200) || 'unexpected failure');
}

/** Run a task to completion (non-stream), walking the chain. Throws TaskError('all_failed') with every attempt. */
export async function complete(req: CompleteRequest): Promise<CompleteResult> {
  const p = plan(req);
  const attempts: Attempt[] = [];
  const t0 = Date.now();
  let gatewayDown = false;
  for (let i = 0; i < p.chain.length; i++) {
    if (req.signal?.aborted) break;
    const target = p.chain[i];
    const r = requestFor(p, target, req);
    if ('skip' in r || (target !== LOCAL_TARGET && gatewayDown)) {
      const err = 'skip' in r ? r.skip : new LlmError('network', 'gateway unreachable earlier in this request');
      const a = failed(target, 'omniroute', 0, err, true);
      attempts.push(a);
      record(p, a, i, false);
      continue;
    }
    const s = Date.now();
    try {
      const res = await chat(r.chatReq);
      const a: Attempt = { target, via: r.via, ok: true, ms: Date.now() - s };
      attempts.push(a);
      const bad = r.via === 'omniroute' && suspect(p.cfg, res);
      record(p, a, i, false, { ...res, tokensIn: res.usage.promptTokens, tokensOut: res.usage.completionTokens, suspect: bad });
      return {
        task: p.task,
        text: res.text,
        route: { target, via: r.via, model: r.via === 'local' ? (res.model ?? p.cfg.local.model) : res.model, provider: r.via === 'local' ? 'lm-studio' : res.provider, connection: res.connection, requestId: res.requestId, fallbackAttempts: res.fallbackAttempts },
        usage: res.usage,
        finishReason: res.finishReason,
        latencyMs: Date.now() - t0,
        webGrounded: p.route.liveWeb === true,
        apiBilledSuspect: bad,
        attempts,
      };
    } catch (e) {
      const err = toLlmError(e);
      if (err.kind === 'aborted') break;
      if (err.kind === 'network' && r.via === 'omniroute') gatewayDown = true;
      const a = failed(target, r.via, Date.now() - s, err);
      attempts.push(a);
      record(p, a, i, false);
    }
  }
  throw new TaskError('all_failed', `every target for "${p.task}" failed`, attempts);
}

/**
 * Streaming variant. Falls back only before the first delta reached the caller (a half-written answer can't be
 * stitched to another model's); after that an error ends the stream by throwing.
 */
export async function* completeStream(req: CompleteRequest): AsyncGenerator<CompleteStreamEvent, void, void> {
  const p = plan(req);
  const attempts: Attempt[] = [];
  const t0 = Date.now();
  let gatewayDown = false;
  for (let i = 0; i < p.chain.length; i++) {
    if (req.signal?.aborted) break;
    const target = p.chain[i];
    const r = requestFor(p, target, req);
    if ('skip' in r || (target !== LOCAL_TARGET && gatewayDown)) {
      const err = 'skip' in r ? r.skip : new LlmError('network', 'gateway unreachable earlier in this request');
      const a = failed(target, 'omniroute', 0, err, true);
      attempts.push(a);
      record(p, a, i, true);
      yield { type: 'attempt', attempt: a };
      continue;
    }
    const s = Date.now();
    let who: (Answerer & { ttfbMs: number }) | null = null;
    let started = false;
    try {
      for await (const ev of chatStream({ ...r.chatReq, idleMs: 60_000 })) {
        if (ev.type === 'meta') {
          who = ev;
          yield {
            type: 'meta',
            task: p.task,
            target,
            via: r.via,
            ttfbMs: ev.ttfbMs,
            webGrounded: p.route.liveWeb === true,
            model: r.via === 'local' ? (ev.model ?? p.cfg.local.model) : ev.model,
            provider: r.via === 'local' ? 'lm-studio' : ev.provider,
            connection: ev.connection,
            requestId: ev.requestId,
            fallbackAttempts: ev.fallbackAttempts,
          };
        } else if (ev.type === 'delta') {
          started = true;
          yield ev;
        } else {
          const a: Attempt = { target, via: r.via, ok: true, ms: Date.now() - s };
          attempts.push(a);
          record(p, a, i, true, { ...(who ?? {}), tokensIn: ev.usage.promptTokens, tokensOut: ev.usage.completionTokens, suspect: r.via === 'omniroute' && !!who && suspect(p.cfg, who) });
          yield { type: 'done', latencyMs: Date.now() - t0, usage: ev.usage, finishReason: ev.finishReason, attempts };
          return;
        }
      }
    } catch (e) {
      const err = toLlmError(e);
      const a = failed(target, r.via, Date.now() - s, err);
      attempts.push(a);
      record(p, a, i, true, who ?? {});
      if (started || err.kind === 'aborted') {
        if (err.kind === 'aborted') return;
        throw new TaskError('all_failed', `stream for "${p.task}" broke after output started (${err.kind})`, attempts);
      }
      if (err.kind === 'network' && r.via === 'omniroute') gatewayDown = true;
      yield { type: 'attempt', attempt: a };
    }
  }
  throw new TaskError('all_failed', `every target for "${p.task}" failed`, attempts);
}
