// Shared (server + client) types for VOLTA Feeds. Types only: safe to `import type` from client code.

export type FeedStatus = 'ok' | 'error' | 'skipped' | 'info';
export type FeedTriage = 'needs-action' | 'fyi' | 'noise';
export type FeedGroup = 'OpenClaw cron' | 'ErisMorn memory' | 'OpenClaw health' | 'Hermes';
export type FeedOrigin = 'openclaw-cron' | 'memory-file' | 'health-report' | 'hermes-cron';

export interface FeedItem {
  id: string;
  /** Source id (one per job / log kind): the left-hand list. */
  source: string;
  sourceLabel: string;
  group: FeedGroup;
  origin: FeedOrigin;
  /** Full job / agent name as the scheduler knows it. */
  job: string;
  agent: string | null;
  /** ISO timestamp of the run (or of the file for log-style items). */
  ranAt: string;
  status: FeedStatus;
  title: string;
  /** Markdown, already passed through the secret masker. */
  body: string;
  /** File path (with ~) or a state locator. */
  link: string | null;
  delivery: string | null;
  durationMs: number | null;
  model: string | null;
  read: boolean;
  triage: FeedTriage | null;
  triageBy: 'jev' | 'rule' | null;
  triageConfidence: number | null;
}

export type FeedListItem = Omit<FeedItem, 'body'> & {
  excerpt: string;
  /** How many times this came up (1 when it did not repeat or merging is off). */
  repeat: number;
  /** Oldest occurrence in the group. */
  firstAt: string;
  /** Every item folded into this row; read marks apply to all of them. */
  memberIds: string[];
  /** Source labels that reported it. */
  from: string[];
};

export interface FeedSource {
  id: string;
  label: string;
  group: FeedGroup;
  total: number;
  unread: number;
  needsAction: number;
  lastAt: string | null;
  lastStatus: FeedStatus | null;
}

export interface FeedJevState {
  enabled: boolean;
  circuitOpen: boolean;
  triaged: number;
  pending: number;
}

export interface FeedListResponse {
  items: FeedListItem[];
  nextCursor: string | null;
  /** Items matching the filters (before paging). */
  matched: number;
  sources: FeedSource[];
  totals: { total: number; unread: number; needsAction: number };
  jev: FeedJevState;
  readStore: { persisted: boolean; path: string; reason?: string };
  refreshedAt: string;
  /** Repeats folded into one row (the default); off shows every run. */
  merged: boolean;
  /** Task-list updates left out of the merged view because Tasks already shows them. */
  hiddenTaskUpdates: number;
  /** Sources that could not be read this time (the rest of the feed still loads). */
  warnings: string[];
}
