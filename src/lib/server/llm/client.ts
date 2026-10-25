import 'server-only';
import { redactSecrets } from '../redact';
import { LlmError, type Answerer, type ChatRequest, type ChatResult, type ChatUsage, type StreamEvent } from './types';

// Minimal OpenAI-compatible chat client (OmniRoute at :20128/v1, LM Studio at :1234/v1).
//   POST {baseUrl}/chat/completions   Authorization: Bearer <key>   { model, messages, max_tokens, stream }
// Every failure is an LlmError whose message is redacted (secret masker + the literal key) and short; the
// request body (prompts) and the key are never part of an error or a log line.

const MAX_ERR_CHARS = 280;
const DEFAULT_IDLE_MS = 60_000;

function scrub(text: string, apiKey?: string): string {
  let t = text;
  if (apiKey && apiKey.length >= 8) t = t.split(apiKey).join('••••');
  return redactSecrets(t).replace(/\s+/g, ' ').trim().slice(0, MAX_ERR_CHARS);
}

function kindForStatus(status: number): LlmError['kind'] {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limited';
  if (status === 408 || status === 504) return 'timeout';
  if (status >= 400 && status < 500) return 'bad_request';
  return 'server';
}

/** Pull `error.message` out of an OpenAI-style error body; fall back to the raw text. */
function errorFromBody(raw: string): string {
  try {
    const j = JSON.parse(raw) as { error?: { message?: unknown } | string; message?: unknown };
    const m = typeof j.error === 'string' ? j.error : (j.error?.message ?? j.message);
    if (typeof m === 'string' && m) return m;
  } catch {
    // not JSON
  }
  return raw;
}

function asNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function usageOf(u: unknown): ChatUsage {
  const o = (u && typeof u === 'object' ? u : {}) as Record<string, unknown>;
  const p = asNum(o.prompt_tokens);
  const c = asNum(o.completion_tokens);
  return { promptTokens: p, completionTokens: c, totalTokens: asNum(o.total_tokens) || p + c };
}

function answererOf(h: Headers, bodyModel: unknown): Answerer {
  const conn = h.get('x-omniroute-selected-connection-id');
  const fb = Number(h.get('x-omniroute-fallback-attempts'));
  return {
    model: (typeof bodyModel === 'string' && bodyModel) || h.get('x-omniroute-model') || null,
    provider: h.get('x-omniroute-provider') || null,
    connection: conn ? conn.slice(0, 8) : null,
    requestId: h.get('x-omniroute-request-id') || null,
    fallbackAttempts: Number.isFinite(fb) && h.get('x-omniroute-fallback-attempts') !== null ? fb : null,
  };
}

/** Models that think (qwen3.x) put the thinking in `reasoning_content`; some servers inline <think> blocks instead. */
function cleanText(t: string): string {
  return t.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^\s+/, '');
}

function buildBody(req: ChatRequest, stream: boolean): string {
  return JSON.stringify({
    model: req.model,
    messages: req.messages,
    ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : { stream: false }),
    ...(req.extraBody ?? {}),
  });
}

/** An AbortController tied to the caller's signal; `arm(ms)` (re)starts the timeout, `disarm()` stops it. */
function guard(signal?: AbortSignal) {
  const ctrl = new AbortController();
  let timer: NodeJS.Timeout | null = null;
  let timedOut = false;
  const onAbort = () => ctrl.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) ctrl.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    arm(ms: number) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        ctrl.abort(new Error('timeout'));
      }, ms);
    },
    disarm() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
    cleanup() {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
    get timedOut() {
      return timedOut;
    },
    abort: () => ctrl.abort(),
  };
}

function wrapFetchError(err: unknown, g: ReturnType<typeof guard>, apiKey?: string, caller?: AbortSignal): LlmError {
  if (err instanceof LlmError) return err;
  if (g.timedOut) return new LlmError('timeout', 'request timed out');
  if (caller?.aborted) return new LlmError('aborted', 'request aborted by caller');
  const e = err as Error & { cause?: { code?: string } };
  const code = e.cause?.code ?? '';
  return new LlmError('network', scrub(`${code ? `${code}: ` : ''}${e.message || 'fetch failed'}`, apiKey));
}

async function open(req: ChatRequest, stream: boolean, g: ReturnType<typeof guard>): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${req.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(req.apiKey ? { Authorization: `Bearer ${req.apiKey}` } : {}) },
      body: buildBody(req, stream),
      signal: g.signal,
      cache: 'no-store',
    });
  } catch (err) {
    throw wrapFetchError(err, g, req.apiKey, req.signal);
  }
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      // body unreadable; the status is enough
    }
    throw new LlmError(kindForStatus(res.status), scrub(errorFromBody(body) || `HTTP ${res.status}`, req.apiKey), res.status);
  }
  return res;
}

/** One non-streaming completion. Throws LlmError (redacted) on any failure, including an empty answer. */
export async function chat(req: ChatRequest): Promise<ChatResult> {
  const t0 = Date.now();
  const g = guard(req.signal);
  g.arm(req.timeoutMs);
  try {
    const res = await open(req, false, g);
    let j: { model?: unknown; choices?: { message?: { content?: unknown }; finish_reason?: unknown }[]; usage?: unknown };
    try {
      j = (await res.json()) as typeof j;
    } catch (err) {
      throw g.timedOut || req.signal?.aborted ? wrapFetchError(err, g, req.apiKey, req.signal) : new LlmError('server', 'gateway returned a non-JSON body', res.status);
    }
    const choice = j.choices?.[0];
    const raw = choice?.message?.content;
    const text = cleanText(typeof raw === 'string' ? raw : '');
    if (!text.trim()) {
      throw new LlmError('empty', `empty answer (finish_reason ${String(choice?.finish_reason ?? 'unknown')}); raise max_tokens if the model spent them thinking`);
    }
    return {
      text,
      usage: usageOf(j.usage),
      finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
      latencyMs: Date.now() - t0,
      ...answererOf(res.headers, j.model),
    };
  } catch (err) {
    throw wrapFetchError(err, g, req.apiKey, req.signal);
  } finally {
    g.cleanup();
  }
}

/**
 * One streaming completion as events: `meta` (first byte; who answered), `delta`* and `done`.
 * `timeoutMs` bounds the wait for the first byte, `idleMs` the silence between chunks afterwards. An empty
 * stream throws 'empty' before any `delta` was emitted, so a router can still fall back.
 */
export async function* chatStream(req: ChatRequest): AsyncGenerator<StreamEvent, void, void> {
  const t0 = Date.now();
  const g = guard(req.signal);
  g.arm(req.timeoutMs);
  let emitted = false;
  try {
    const res = await open(req, true, g);
    if (!res.body) throw new LlmError('server', 'gateway returned no stream body', res.status);
    const who = answererOf(res.headers, null);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let usage: ChatUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let finish: string | null = null;
    let model: string | null = who.model;
    let first = true;
    let inThink = false;
    const idle = req.idleMs ?? DEFAULT_IDLE_MS;
    try {
      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (err) {
          throw wrapFetchError(err, g, req.apiKey, req.signal);
        }
        if (chunk.done) break;
        g.arm(idle);
        buf += dec.decode(chunk.value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          let j: { model?: unknown; choices?: { delta?: { content?: unknown }; finish_reason?: unknown }[]; usage?: unknown; error?: { message?: unknown } };
          try {
            j = JSON.parse(data) as typeof j;
          } catch {
            continue;
          }
          if (j.error) throw new LlmError('server', scrub(String(j.error.message ?? 'stream error'), req.apiKey));
          if (typeof j.model === 'string' && j.model) model = j.model;
          if (j.usage) usage = usageOf(j.usage);
          const c = j.choices?.[0];
          if (typeof c?.finish_reason === 'string') finish = c.finish_reason;
          let text = typeof c?.delta?.content === 'string' ? c.delta.content : '';
          if (!text) continue;
          // Drop inline <think>…</think> blocks that arrive split across chunks.
          if (inThink) {
            const end = text.indexOf('</think>');
            if (end < 0) continue;
            inThink = false;
            text = text.slice(end + 8);
          }
          const open1 = text.indexOf('<think>');
          if (open1 >= 0) {
            const end = text.indexOf('</think>', open1);
            if (end < 0) {
              inThink = true;
              text = text.slice(0, open1);
            } else text = text.slice(0, open1) + text.slice(end + 8);
          }
          if (!emitted) text = text.replace(/^\s+/, '');
          if (!text) continue;
          if (first) {
            first = false;
            yield { type: 'meta', ttfbMs: Date.now() - t0, ...who, model };
          }
          emitted = true;
          yield { type: 'delta', text };
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    if (!emitted) throw new LlmError('empty', `empty stream (finish_reason ${String(finish ?? 'unknown')}); raise max_tokens if the model spent them thinking`);
    yield { type: 'done', usage, finishReason: finish, latencyMs: Date.now() - t0 };
  } catch (err) {
    throw wrapFetchError(err, g, req.apiKey, req.signal);
  } finally {
    g.cleanup();
  }
}
