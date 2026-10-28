// Shared (client + server) shapes for VOLTA Tasks. Pure types and helpers: no server-only imports.

/** Checkbox legend of ~/.openclaw/wiki/main/actions.md: [ ] todo, [>] progress, [x] done, [!] blocked, [@] awaiting Patrick. */
export type ActionStatus = 'todo' | 'progress' | 'done' | 'blocked' | 'awaiting';

export const ACTION_STATUSES: ActionStatus[] = ['awaiting', 'blocked', 'progress', 'todo', 'done'];

export type ActionLinkKind = 'wiki' | 'url' | 'arxiv';

export interface ActionLink {
  kind: ActionLinkKind;
  label: string;
  /** wiki: ~/.openclaw-relative path; url/arxiv: absolute URL */
  target: string;
}

export interface ActionItem {
  /** Stable hash of the item text (status, aging counter and dates stripped), so it survives status moves. */
  id: string;
  text: string;
  status: ActionStatus;
  /** Checkbox character as written in the file. */
  marker: string;
  /** Heading the item sits under ("Open", "Done"). */
  section: string;
  /** 1-based line of the `## heading` in actions.md (0 if the item precedes any heading). */
  sectionLine: number;
  /** 1-based line of the checkbox in actions.md. */
  line: number;
  /** Who it is waiting on / who owns it: "Patrick" for [@], an explicit claim for [>], otherwise "OpenClaw" (the pipeline). */
  agent: string;
  /** Capture date: the trailing [[YYYY-MM-DD]] wikilink. */
  created: string | null;
  /** Last touched / completed date: the trailing (YYYY-MM-DD). */
  updated: string | null;
  /** The "(aging Nd)" counter the pipeline wrote, as of its last run. */
  agingDays: number | null;
  /** Days since `created` (fallback `updated`) as of this response; null when the item has no date. */
  ageDays: number | null;
  /** Indented lines under the item. */
  notes: string[];
  links: ActionLink[];
}

export interface ActionCounts {
  total: number;
  byStatus: Record<ActionStatus, number>;
  byAgent: Record<string, number>;
  bySection: Record<string, number>;
}

export interface ActionsSource {
  /** Display path, home-relative. */
  path: string;
  /** `open ...` command the UI offers to copy. */
  openHint: string;
  mtime: string | null;
  size: number | null;
  /** Title/updated front-matter fields, when present. */
  updatedFrontmatter: string | null;
}

export interface ActionsResponse {
  available: boolean;
  /** Present when the file could not be read. */
  reason?: string;
  source: ActionsSource;
  counts: ActionCounts;
  /** Omitted from the `?counts=1` payload. */
  items?: ActionItem[];
  generatedAt: string;
}

export const DEFAULT_STALE_DAYS = 14;

/** Stale items at least this old get the loud (filled) badge; younger stale items an outline. */
export const VERY_STALE_DAYS = 30;

export function isStale(item: Pick<ActionItem, 'status' | 'ageDays'>, staleDays: number): boolean {
  return item.status !== 'done' && item.ageDays !== null && item.ageDays >= staleDays;
}
