/** Wire + domain types for the TypeSafe System One (Jev) client. */

export type JevOp = 'route' | 'rank' | 'triage' | 'judge';

export interface NoulQuestion {
  type: 'noul';
  instructions: string;
  criteria?: { true?: string; false?: string };
}
export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
}
export interface ScoreQuestion {
  type: 'score';
  instructions: string;
  criteria: string[];
}
export type JevQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface NoulAnswer {
  type: 'noul';
  noul: number;
}
export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}
export interface ScoreAnswer {
  type: 'score';
  score: number;
  confidence: number;
}
export type JevAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export interface JevUsage {
  input_tokens: number;
  output_tokens: number;
}

/** Per-call metadata. `cached` calls cost nothing and do not hit the network. */
export interface JevCallMeta {
  cached: boolean;
  latencyMs: number;
  inputTokens: number;
  costUsd: number;
  requests: number;
}

export type JevErrorCode = 'no_key' | 'auth' | 'bad_request' | 'rate_limited' | 'server' | 'network' | 'timeout' | 'circuit_open' | 'bad_response';

/** Never carries credentials or request bodies. */
export class JevError extends Error {
  readonly code: JevErrorCode;
  readonly status: number | null;
  constructor(code: JevErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = 'JevError';
    this.code = code;
    this.status = status;
  }
}

export type ModelTierName = 'HAIKU' | 'SONNET' | 'OPUS';

// ── route / rank / triage / judge ──

export interface RouteInput {
  task: string;
  /** id → description. "none" is reserved. */
  candidates: Record<string, string>;
  k?: number;
  /** Below this confidence (or when Jev says "none") the result abstains. Default 0.5. */
  minConfidence?: number;
}
export interface RouteResult {
  choice: string | null;
  guess: string | null;
  abstained: boolean;
  confidence: number;
  ranking: { id: string; probability: number }[];
  meta: JevCallMeta;
}

export interface JevItem {
  id: string | number;
  text: string;
}
export interface RankInput {
  items: JevItem[];
  criterion: string;
  levels?: string[];
  top?: number;
}
export interface RankResult {
  max: number;
  ranked: { id: string | number; score: number; confidence: number }[];
  unscored: (string | number)[];
  meta: JevCallMeta;
}

export interface TriageInput {
  items: JevItem[];
  labels: Record<string, string>;
  minConfidence?: number;
}
export interface TriageResult {
  results: { id: string | number; label: string | null; guess: string | null; confidence: number; probabilities: Record<string, number> }[];
  meta: JevCallMeta;
}

export interface JudgeInput {
  text: string;
  questions: string[];
  threshold?: number;
}
export interface JudgeResult {
  pass: boolean;
  incomplete: boolean;
  threshold: number;
  results: { question: string; probability: number | null; pass: boolean }[];
  meta: JevCallMeta;
}

// ── telemetry ──

export interface JevTelemetryFile {
  version: 1;
  since: string;
  updatedAt: string;
  /** Network requests to the JEV API that returned answers. */
  requests: number;
  cacheHits: number;
  errors: number;
  /** Heuristic-fallback routings (JEV unreachable). Cost 0. */
  fallbacks: number;
  inputTokens: number;
  outputTokens: number;
  totalUsd: number;
  latencyMs: { avg: number; p50: number; p95: number; max: number; samples: number[] };
  byOp: Record<JevOp, number>;
  /** Tier decisions made by the router, including fallbacks. */
  byTier: Record<ModelTierName, number>;
  lastError: { at: string; code: string; message: string } | null;
}
