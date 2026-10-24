// Honcho v3 API shapes (verified against ~/ErisMorn/projects/honcho/src/schemas/api.py)
// plus the small app-level envelopes our /api/honcho proxy adds.

export type HonchoJson = Record<string, unknown>;

/** fastapi-pagination offset `Page` (we never opt into cursor mode). */
export interface HonchoPage<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface HonchoWorkspace {
  id: string;
  metadata: HonchoJson;
  configuration: HonchoJson;
  created_at: string;
}

export interface HonchoPeer {
  id: string;
  workspace_id: string;
  created_at: string;
  metadata: HonchoJson;
  configuration: HonchoJson;
}

export interface HonchoSession {
  id: string;
  is_active: boolean;
  workspace_id: string;
  metadata: HonchoJson;
  configuration: HonchoJson;
  created_at: string;
}

export interface HonchoMessage {
  id: string;
  content: string;
  peer_id: string;
  session_id: string;
  metadata: HonchoJson;
  created_at: string;
  workspace_id: string;
  token_count: number;
}

export interface HonchoSummary {
  content: string;
  /** Public id of the last message this summary covers. */
  message_id: string;
  summary_type: string;
  created_at: string;
  token_count: number;
}

export interface HonchoSessionSummaries {
  id: string;
  short_summary: HonchoSummary | null;
  long_summary: HonchoSummary | null;
}

export type HonchoConclusionLevel = 'explicit' | 'deductive' | 'inductive' | 'contradiction';

export interface HonchoConclusion {
  id: string;
  content: string;
  observer_id: string;
  observed_id: string;
  session_id: string | null;
  level: HonchoConclusionLevel;
  source_ids: string[];
  times_derived: number;
  created_at: string;
}

export interface HonchoSessionQueueStatus {
  session_id: string | null;
  total_work_units: number;
  completed_work_units: number;
  in_progress_work_units: number;
  pending_work_units: number;
}

export interface HonchoQueueStatus {
  total_work_units: number;
  completed_work_units: number;
  in_progress_work_units: number;
  pending_work_units: number;
  sessions: Record<string, HonchoSessionQueueStatus> | null;
}

/** GET /deriver/metrics (undocumented, 503 until the poller has a measurement). */
export interface HonchoDeriverMetrics {
  outstanding_work_seconds: number;
  eligible_work_units: number;
  claimed_work_units: number;
  pending_items: number;
  oldest_pending_age_seconds: number;
  embeddings_pending: number;
  embeddings_pending_due: number;
  dreams_due: number;
  measured_at: string | number;
  measurement_age_seconds: number;
}

export interface HonchoPeerCard {
  peer_card: string[] | null;
}

export interface HonchoRepresentation {
  representation: string;
}

export interface HonchoDialecticResponse {
  content: string | null;
}

export type HonchoReasoningLevel = 'minimal' | 'low' | 'medium' | 'high' | 'max';
export const HONCHO_REASONING_LEVELS: HonchoReasoningLevel[] = ['minimal', 'low', 'medium', 'high', 'max'];

// ── App-level envelopes (our proxy) ──

export interface HonchoStatus {
  online: true;
  url: string;
  latencyMs: number;
}

/** Body of every 503 the proxy returns when Honcho is unreachable. */
export interface HonchoOfflineBody {
  error: string;
  offline: true;
  url: string;
}

export interface HonchoQueueResponse {
  queue: HonchoQueueStatus;
  /** null when the deriver poller hasn't measured yet (or the endpoint is missing). */
  deriver: HonchoDeriverMetrics | null;
}

export interface HonchoPeerStat {
  sessions: number;
  /** Messages sent by this peer across its sessions; null if not computed. */
  messages: number | null;
}

export interface HonchoStats {
  peers: Record<string, HonchoPeerStat>;
  /** Message totals per session (for the sessions that were counted). */
  sessions: Record<string, number>;
  /** True when caps were hit and some counts are lower bounds. */
  partial: boolean;
  computedAt: string;
}

export interface HonchoChatRequest {
  query: string;
  /** Ask from this peer's perspective (peer chat); omit for workspace chat. */
  peer?: string;
  /** Peer to ask about, from `peer`'s perspective. */
  target?: string;
  session?: string;
  reasoning_level?: HonchoReasoningLevel;
}

export interface HonchoChatResponse {
  content: string | null;
  mode: 'peer' | 'workspace';
  elapsedMs: number;
}

export interface HonchoSearchRequest {
  query: string;
  limit?: number;
  peer?: string;
  session?: string;
}
