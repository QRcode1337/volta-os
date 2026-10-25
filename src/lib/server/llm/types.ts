// Shared types for the VOLTA LLM layer. No 'server-only' here: route handlers and tests may import the types.

export type Role = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: Role;
  content: string;
}

export type LlmErrorKind = 'timeout' | 'network' | 'auth' | 'rate_limited' | 'bad_request' | 'server' | 'empty' | 'aborted' | 'no_key' | 'config';

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly status?: number;
  constructor(kind: LlmErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
    this.status = status;
  }
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** What the gateway told us about who answered (x-omniroute-* headers + the response `model`). */
export interface Answerer {
  /** `model` from the response body (or the x-omniroute-model header). */
  model: string | null;
  /** x-omniroute-provider (OmniRoute's short alias, e.g. "cx" = codex) or the body's provider. */
  provider: string | null;
  /** First 8 chars of x-omniroute-selected-connection-id; never the full id. */
  connection: string | null;
  requestId: string | null;
  fallbackAttempts: number | null;
}

export interface ChatResult extends Answerer {
  text: string;
  usage: ChatUsage;
  finishReason: string | null;
  latencyMs: number;
}

export type StreamEvent =
  | ({ type: 'meta'; ttfbMs: number } & Answerer)
  | { type: 'delta'; text: string }
  | { type: 'done'; usage: ChatUsage; finishReason: string | null; latencyMs: number };

export interface ChatRequest {
  baseUrl: string;
  /** Sent as a Bearer token when set. Never logged, never echoed in an error. */
  apiKey?: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Total budget for a non-stream call; time to the first byte for a stream. */
  timeoutMs: number;
  /** Streams only: max silence between chunks once the first byte arrived. */
  idleMs?: number;
  signal?: AbortSignal;
  extraBody?: Record<string, unknown>;
}

export interface TaskRoute {
  chain: string[];
  timeoutMs: number;
  maxTokens: number;
  liveWeb?: boolean;
  note?: string;
}

export interface RoutesConfig {
  gateway: { baseUrl: string; keyEnv: string; baseUrlEnv: string };
  local: { baseUrl: string; model: string; timeoutMs: number; minMaxTokens: number };
  limits: { maxMessages: number; maxChars: number; maxOutputTokens: number; maxTimeoutMs: number };
  apiBilledProviders: string[];
  tasks: Record<string, TaskRoute>;
  verified: unknown;
  errors: string[];
}

export interface CompleteRequest {
  task: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Per-attempt timeout override (clamped to limits.maxTimeoutMs). */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface Attempt {
  target: string; // combo name or "local"
  via: 'omniroute' | 'local';
  ok: boolean;
  skipped?: boolean;
  status?: number;
  ms: number;
  error?: { kind: LlmErrorKind; message: string };
}

export interface CompleteResult {
  task: string;
  text: string;
  /** The target that answered and who ran it inside OmniRoute. */
  route: { target: string; via: 'omniroute' | 'local' } & Answerer;
  usage: ChatUsage;
  finishReason: string | null;
  latencyMs: number;
  /** false for research-web: no live search is available through the gateway. */
  webGrounded: boolean;
  /** true when the answering provider matches the API-billed list (should never happen with the scoped key). */
  apiBilledSuspect: boolean;
  attempts: Attempt[];
}

export type CompleteStreamEvent =
  | { type: 'attempt'; attempt: Attempt }
  | ({ type: 'meta'; task: string; target: string; via: 'omniroute' | 'local'; ttfbMs: number; webGrounded: boolean } & Answerer)
  | { type: 'delta'; text: string }
  | { type: 'done'; latencyMs: number; usage: ChatUsage; finishReason: string | null; attempts: Attempt[] };
