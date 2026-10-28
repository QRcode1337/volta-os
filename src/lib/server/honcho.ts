import 'server-only';
import type {
  HonchoConclusion,
  HonchoDeriverMetrics,
  HonchoDialecticResponse,
  HonchoMessage,
  HonchoPage,
  HonchoPeer,
  HonchoPeerCard,
  HonchoQueueStatus,
  HonchoReasoningLevel,
  HonchoRepresentation,
  HonchoSession,
  HonchoSessionSummaries,
  HonchoStats,
  HonchoWorkspace,
} from '@/types/honcho';
import { HttpError } from './http-error';
import { redactSecrets } from './redact';

// Server-only client for the self-hosted Honcho memory server (Plastic Labs, Docker).
// Read-mostly: the only non-read calls are dialectic chat + semantic queries, which
// Honcho exposes as POSTs but which do not mutate stored memory.

export const HONCHO_URL = (process.env.HONCHO_API_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');
export const HONCHO_START_COMMAND = 'cd ~/ErisMorn/projects/honcho && docker compose up -d';

const DEFAULT_TIMEOUT_MS = 4_000;
/** Dialectic chat runs an agent loop; give it far longer than plain reads. */
export const CHAT_TIMEOUT_MS = 180_000;

/** Honcho is not reachable (connection refused, DNS, or the 4s timeout elapsed). */
export class HonchoOfflineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HonchoOfflineError';
  }
}

/** Honcho answered with a non-2xx status. */
export class HonchoApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'HonchoApiError';
  }
}

/** Upstream call exceeded a long (non-offline) deadline, e.g. a slow chat. */
export class HonchoTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HonchoTimeoutError';
  }
}

/**
 * The one Honcho -> HTTP mapping (used by the /api/honcho routes). Messages are masked like proxied bodies:
 * upstream FastAPI details can echo request text. Anything that is not a Honcho error is returned unchanged.
 */
export function honchoHttpError(err: unknown): unknown {
  if (err instanceof HonchoOfflineError) return new HttpError(redactSecrets(err.message), 503, { offline: true, url: HONCHO_URL });
  if (err instanceof HonchoTimeoutError) return new HttpError(redactSecrets(err.message), 504, { timeout: true });
  if (err instanceof HonchoApiError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    // A 503 from Honcho itself (e.g. DB not ready) is not "offline"; surface it as a gateway error.
    return new HttpError(redactSecrets(err.message), status === 503 ? 502 : status, { upstreamStatus: err.status });
  }
  if ((err as Error)?.name === 'AbortError') return new HttpError('cancelled', 499);
  return err;
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOpts {
  query?: Query;
  body?: unknown;
  timeoutMs?: number;
  /** Caller abort (e.g. the browser cancelled the proxy request). */
  signal?: AbortSignal;
}

const enc = encodeURIComponent;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(HONCHO_URL + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) if (v != null && v !== '') url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** FastAPI errors: `{detail: string}` or 422 `{detail: [{loc, msg}]}`. */
function detailOf(body: unknown, status: number): string {
  const d = (body as { detail?: unknown } | null)?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) {
    return d
      .map((e: { loc?: unknown[]; msg?: string }) => `${(e.loc ?? []).slice(1).join('.') || 'body'}: ${e.msg ?? 'invalid'}`)
      .join('; ');
  }
  return `Honcho returned HTTP ${status}`;
}

/** undici reports every network-level failure as TypeError("fetch failed") with a `cause.code`
 *  (ECONNREFUSED, ENOTFOUND, ECONNRESET, UND_ERR_SOCKET…). */
function isConnectionFailure(err: unknown): boolean {
  return (err as { name?: string })?.name === 'TypeError';
}

async function request<T>(method: 'GET' | 'POST', path: string, opts: RequestOpts = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout;
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers: opts.body !== undefined ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal,
      cache: 'no-store',
    });
  } catch (err) {
    if (opts.signal?.aborted) throw err; // caller went away; let the route drop it
    if (timeout.aborted) {
      if (timeoutMs > DEFAULT_TIMEOUT_MS) throw new HonchoTimeoutError(`Honcho did not answer within ${Math.round(timeoutMs / 1000)}s`);
      throw new HonchoOfflineError(`Honcho did not respond within ${timeoutMs / 1000}s at ${HONCHO_URL}`);
    }
    if (isConnectionFailure(err)) {
      const code = (err as { cause?: { code?: string } }).cause?.code;
      throw new HonchoOfflineError(`Cannot reach Honcho at ${HONCHO_URL}${code ? ` (${code})` : ''}`);
    }
    throw err;
  }
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    // 502/503/504 from a reverse proxy or a container still booting means "not up yet".
    if ((res.status === 502 || res.status === 504) && body == null) throw new HonchoOfflineError(`Honcho is starting (HTTP ${res.status})`);
    throw new HonchoApiError(detailOf(body, res.status), res.status);
  }
  return body as T;
}

const W = (w: string) => `/v3/workspaces/${enc(w)}`;

/**
 * Opens a streaming (SSE) Honcho response. Resolves once headers arrive, with the upstream body
 * left unread; errors map to the same Offline/Api/Timeout classes as `request`. The deadline and the
 * caller's signal stay attached to the body read, so aborting either cancels the upstream stream.
 */
async function openStream(path: string, body: unknown, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<Response> {
  const timeout = AbortSignal.timeout(opts.timeoutMs);
  const signal = opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout;
  let res: Response;
  try {
    res = await fetch(buildUrl(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
      cache: 'no-store',
    });
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    if (timeout.aborted) throw new HonchoTimeoutError(`Honcho did not answer within ${Math.round(opts.timeoutMs / 1000)}s`);
    if (isConnectionFailure(err)) {
      const code = (err as { cause?: { code?: string } }).cause?.code;
      throw new HonchoOfflineError(`Cannot reach Honcho at ${HONCHO_URL}${code ? ` (${code})` : ''}`);
    }
    throw err;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if ((res.status === 502 || res.status === 504) && parsed == null) throw new HonchoOfflineError(`Honcho is starting (HTTP ${res.status})`);
    throw new HonchoApiError(detailOf(parsed, res.status), res.status);
  }
  if (!res.body) throw new HonchoApiError('Honcho returned an empty stream', 502);
  return res;
}

/** Streaming dialectic answer (workspace-level chat also supports `stream: true`). Honcho emits SSE frames
 *  `data: {"delta":{"content":"…"},"done":false}` and a final `data: {"done":true}`. */
export function workspaceChatStream(
  w: string,
  opts: { query: string; session?: string; reasoning_level?: HonchoReasoningLevel; signal?: AbortSignal },
) {
  return openStream(
    `${W(w)}/chat`,
    { query: opts.query, session_id: opts.session ?? null, reasoning_level: opts.reasoning_level ?? 'low', stream: true },
    { timeoutMs: CHAT_TIMEOUT_MS, signal: opts.signal },
  );
}

export function peerChatStream(
  w: string,
  peer: string,
  opts: { query: string; target?: string; session?: string; reasoning_level?: HonchoReasoningLevel; signal?: AbortSignal },
) {
  return openStream(
    `${W(w)}/peers/${enc(peer)}/chat`,
    { query: opts.query, target: opts.target ?? null, session_id: opts.session ?? null, reasoning_level: opts.reasoning_level ?? 'low', stream: true },
    { timeoutMs: CHAT_TIMEOUT_MS, signal: opts.signal },
  );
}


// ── Health / status ──

export async function health(): Promise<{ latencyMs: number }> {
  const t0 = performance.now();
  await request<{ status: string }>('GET', '/health');
  return { latencyMs: Math.round(performance.now() - t0) };
}

export function queueStatus(w: string, opts: { session?: string; observer?: string; sender?: string } = {}) {
  return request<HonchoQueueStatus>('GET', `${W(w)}/queue/status`, {
    query: { session_id: opts.session, observer_id: opts.observer, sender_id: opts.sender },
  });
}

/** Undocumented operational endpoint; null when it 503s ("no measurement yet") or is absent. */
export async function deriverMetrics(): Promise<HonchoDeriverMetrics | null> {
  try {
    return await request<HonchoDeriverMetrics>('GET', '/deriver/metrics');
  } catch (err) {
    if (err instanceof HonchoApiError) return null;
    throw err;
  }
}

// ── Workspaces ──

export function listWorkspaces(page = 1, size = 100) {
  return request<HonchoPage<HonchoWorkspace>>('POST', '/v3/workspaces/list', { query: { page, size }, body: {} });
}

export function searchWorkspace(w: string, query: string, limit = 20, filters?: Record<string, unknown>) {
  return request<HonchoMessage[]>('POST', `${W(w)}/search`, { body: { query, limit, ...(filters ? { filters } : {}) }, timeoutMs: 15_000 });
}

export function workspaceChat(
  w: string,
  opts: { query: string; session?: string; reasoning_level?: HonchoReasoningLevel; signal?: AbortSignal },
) {
  return request<HonchoDialecticResponse>('POST', `${W(w)}/chat`, {
    body: { query: opts.query, session_id: opts.session ?? null, reasoning_level: opts.reasoning_level ?? 'low', stream: false },
    timeoutMs: CHAT_TIMEOUT_MS,
    signal: opts.signal,
  });
}

// ── Peers ──

export function listPeers(w: string, page = 1, size = 100) {
  return request<HonchoPage<HonchoPeer>>('POST', `${W(w)}/peers/list`, { query: { page, size }, body: {} });
}

export function peerSessions(w: string, peer: string, page = 1, size = 50) {
  return request<HonchoPage<HonchoSession>>('POST', `${W(w)}/peers/${enc(peer)}/sessions`, {
    query: { page, size, reverse: true },
    body: {},
  });
}

export function peerCard(w: string, peer: string, target?: string) {
  return request<HonchoPeerCard>('GET', `${W(w)}/peers/${enc(peer)}/card`, { query: { target } });
}

export function peerRepresentation(w: string, peer: string, opts: { target?: string; session?: string; searchQuery?: string } = {}) {
  const body: Record<string, unknown> = {};
  if (opts.target) body.target = opts.target;
  if (opts.session) body.session_id = opts.session;
  if (opts.searchQuery) {
    body.search_query = opts.searchQuery;
    body.search_top_k = 20;
    body.include_most_frequent = true;
  }
  // search_query triggers an embedding call; allow a little more than a plain read.
  return request<HonchoRepresentation>('POST', `${W(w)}/peers/${enc(peer)}/representation`, {
    body,
    timeoutMs: opts.searchQuery ? 20_000 : 10_000,
  });
}

export function peerChat(
  w: string,
  peer: string,
  opts: { query: string; target?: string; session?: string; reasoning_level?: HonchoReasoningLevel; signal?: AbortSignal },
) {
  return request<HonchoDialecticResponse>('POST', `${W(w)}/peers/${enc(peer)}/chat`, {
    body: {
      query: opts.query,
      target: opts.target ?? null,
      session_id: opts.session ?? null,
      reasoning_level: opts.reasoning_level ?? 'low',
      stream: false,
    },
    timeoutMs: CHAT_TIMEOUT_MS,
    signal: opts.signal,
  });
}

export function searchPeer(w: string, peer: string, query: string, limit = 20) {
  return request<HonchoMessage[]>('POST', `${W(w)}/peers/${enc(peer)}/search`, { body: { query, limit }, timeoutMs: 15_000 });
}

// ── Sessions ──

export function listSessions(w: string, page = 1, size = 50) {
  return request<HonchoPage<HonchoSession>>('POST', `${W(w)}/sessions/list`, { query: { page, size, reverse: true }, body: {} });
}

export function sessionPeers(w: string, s: string) {
  return request<HonchoPage<HonchoPeer>>('GET', `${W(w)}/sessions/${enc(s)}/peers`, { query: { page: 1, size: 100 } });
}

export function sessionSummaries(w: string, s: string) {
  return request<HonchoSessionSummaries>('GET', `${W(w)}/sessions/${enc(s)}/summaries`);
}

export function searchSession(w: string, s: string, query: string, limit = 20) {
  return request<HonchoMessage[]>('POST', `${W(w)}/sessions/${enc(s)}/search`, { body: { query, limit }, timeoutMs: 15_000 });
}

export interface MessageWindow {
  order: 'asc' | 'desc';
  /** created_at strictly before (ISO). */
  before?: string;
  /** created_at strictly after (ISO). */
  after?: string;
  /** created_at at-or-after (ISO). */
  from?: string;
  peer?: string;
  page?: number;
  size?: number;
}

/** One message by id (deep links carry the id; the thread window needs its created_at). 404 when gone. */
export function getMessage(w: string, s: string, m: string) {
  return request<HonchoMessage>('GET', `${W(w)}/sessions/${enc(s)}/messages/${enc(m)}`);
}

/** Messages in a session. `total` in the page reflects the window filters. */
export function sessionMessages(w: string, s: string, win: MessageWindow) {
  const created: Record<string, string> = {};
  if (win.before) created.lt = win.before;
  if (win.after) created.gt = win.after;
  if (win.from) created.gte = win.from;
  const filters: Record<string, unknown> = {};
  if (Object.keys(created).length) filters.created_at = created;
  if (win.peer) filters.peer_id = win.peer;
  return request<HonchoPage<HonchoMessage>>('POST', `${W(w)}/sessions/${enc(s)}/messages/list`, {
    query: { page: win.page ?? 1, size: win.size ?? 50, reverse: win.order === 'desc' },
    body: Object.keys(filters).length ? { filters } : {},
  });
}

// ── Conclusions ──

export interface ConclusionFilter {
  observer?: string;
  observed?: string;
  session?: string;
  level?: string;
}

function conclusionFilters(f: ConclusionFilter): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  if (f.observer) out.observer_id = f.observer;
  if (f.observed) out.observed_id = f.observed;
  if (f.session) out.session_id = f.session;
  if (f.level) out.level = f.level;
  return Object.keys(out).length ? out : undefined;
}

export function listConclusions(w: string, f: ConclusionFilter, page = 1, size = 50) {
  const filters = conclusionFilters(f);
  return request<HonchoPage<HonchoConclusion>>('POST', `${W(w)}/conclusions/list`, {
    query: { page, size },
    body: filters ? { filters } : {},
  });
}

/** Semantic search; Honcho requires both observer and observed. */
export function queryConclusions(w: string, opts: { query: string; observer: string; observed: string; topK?: number; distance?: number }) {
  return request<HonchoConclusion[]>('POST', `${W(w)}/conclusions/query`, {
    body: {
      query: opts.query,
      top_k: opts.topK ?? 20,
      ...(opts.distance != null ? { distance: opts.distance } : {}),
      filters: { observer: opts.observer, observed: opts.observed },
    },
    timeoutMs: 20_000,
  });
}

// ── Derived stats (peer/session message counts) ──
// Honcho has no count endpoint, so we read `total` from size=1 pages. Bounded fan-out
// (~150–200 upstream calls), cached per workspace for 10 min; counts change slowly and the
// UI shows `computedAt`. A forced refresh shares an in-flight run and is honoured at most
// once a minute, so repeated Reload clicks cannot stack fan-outs.

const STATS_TTL_MS = 10 * 60_000;
const STATS_FRESH_MIN_MS = 60_000;
const MAX_SESSIONS = 300;
const MAX_PEER_SESSION_PAIRS = 400;
const g = globalThis as unknown as { __honchoStats?: Map<string, { at: number; done?: boolean; value: Promise<HonchoStats> }> };

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function allPages<T>(fetchPage: (page: number) => Promise<HonchoPage<T>>, cap: number): Promise<{ items: T[]; total: number }> {
  const first = await fetchPage(1);
  const items = [...first.items];
  for (let p = 2; p <= first.pages && items.length < cap; p++) items.push(...(await fetchPage(p)).items);
  return { items: items.slice(0, cap), total: first.total };
}

async function computeStats(w: string): Promise<HonchoStats> {
  let partial = false;
  const peers = await allPages((p) => listPeers(w, p, 100), 500);
  const sessions = await allPages((p) => listSessions(w, p, 100), MAX_SESSIONS);
  if (sessions.total > sessions.items.length || peers.total > peers.items.length) partial = true;

  const sessionTotals = await pool(sessions.items, 8, async (s) => {
    try {
      return [s.id, (await sessionMessages(w, s.id, { order: 'asc', size: 1 })).total] as const;
    } catch (err) {
      if (err instanceof HonchoOfflineError) throw err;
      partial = true;
      return [s.id, -1] as const;
    }
  });

  const peerSessionLists = await pool(peers.items, 6, async (peer) => {
    const page = await peerSessions(w, peer.id, 1, 100);
    if (page.total > page.items.length) partial = true;
    return { peer: peer.id, total: page.total, ids: page.items.map((s) => s.id) };
  });

  let pairs = peerSessionLists.flatMap((p) => p.ids.map((s) => ({ peer: p.peer, session: s })));
  if (pairs.length > MAX_PEER_SESSION_PAIRS) {
    partial = true;
    pairs = pairs.slice(0, MAX_PEER_SESSION_PAIRS);
  }
  const pairCounts = await pool(pairs, 8, async ({ peer, session }) => {
    try {
      return { peer, n: (await sessionMessages(w, session, { order: 'asc', size: 1, peer })).total };
    } catch (err) {
      if (err instanceof HonchoOfflineError) throw err;
      partial = true;
      return { peer, n: 0 };
    }
  });

  const peerStats: HonchoStats['peers'] = {};
  for (const p of peerSessionLists) peerStats[p.peer] = { sessions: p.total, messages: 0 };
  for (const c of pairCounts) peerStats[c.peer].messages = (peerStats[c.peer].messages ?? 0) + c.n;

  const sessionStats: Record<string, number> = {};
  for (const [id, n] of sessionTotals) if (n >= 0) sessionStats[id] = n;

  return { peers: peerStats, sessions: sessionStats, partial, computedAt: new Date().toISOString() };
}

export function workspaceStats(w: string, fresh = false): Promise<HonchoStats> {
  const cache = (g.__honchoStats ??= new Map());
  const hit = cache.get(w);
  if (hit && (hit.done === false || Date.now() - hit.at < (fresh ? STATS_FRESH_MIN_MS : STATS_TTL_MS))) return hit.value;
  const entry: { at: number; done: boolean; value: Promise<HonchoStats> } = { at: Date.now(), done: false, value: computeStats(w) };
  cache.set(w, entry);
  entry.value.then(
    () => {
      entry.done = true;
    },
    () => {
      if (cache.get(w) === entry) cache.delete(w);
    },
  );
  return entry.value;
}
