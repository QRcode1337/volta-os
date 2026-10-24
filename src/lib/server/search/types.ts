// VOLTA Search contracts (GET /api/search). Types only: safe to `import type` from client components.

export type SearchSourceId = 'ltm' | 'notes' | 'claude-mem' | 'honcho' | 'notion' | 'skills' | 'routines' | 'mcp';

export const SEARCH_SOURCE_IDS: SearchSourceId[] = ['ltm', 'notes', 'claude-mem', 'honcho', 'notion', 'skills', 'routines', 'mcp'];

/**
 * ok = answered (possibly 0 hits) · partial = answered, but part of the source failed (see `note`) ·
 * timeout = no answer within the per-source budget (work may continue in the background) ·
 * offline = service not reachable / drive not mounted · error = answered with an error ·
 * skipped = not queried (query too short for a semantic source).
 */
export type SearchSourceState = 'ok' | 'partial' | 'timeout' | 'offline' | 'error' | 'skipped';

/** How the source matches: literal substring, embedding similarity (hits may not contain the words), or name/description. */
export type SearchMode = 'substring' | 'phrase' | 'semantic' | 'name';

/** [start, end) character offsets into the string they accompany. */
export type Range = [number, number];

export interface SearchLink {
  href: string;
  label: string;
  external: boolean;
}

export interface SearchHit {
  id: string; // unique within the source
  source: SearchSourceId;
  title: string;
  titleHighlights: Range[];
  snippet: string; // secrets masked
  highlights: Range[];
  /** ISO timestamp, or a naive local one for LTM (no zone; parse as local time). Null when unknown. */
  when: string | null;
  /** Primary link (in-app route or external URL); null when the source has no openable target. */
  href: string | null;
  external: boolean;
  /** ⌘Enter target (e.g. obsidian:// for a note). */
  secondary: SearchLink | null;
  /** Small labels: app, vault, type, project … */
  meta: string[];
}

export interface SearchSourceResult {
  source: SearchSourceId;
  label: string;
  mode: SearchMode;
  status: SearchSourceState;
  ms: number;
  /** Exact number of matches when the source can count them; null when unknown (semantic, capped). */
  total: number | null;
  hits: SearchHit[];
  /** Human note: why a source timed out / is partial, what the match mode means, etc. */
  note: string | null;
}

export interface SearchResponse {
  q: string;
  terms: string[];
  tookMs: number;
  sources: SearchSourceResult[];
  /** True when some source timed out while warming (notes index, skills scan): re-asking shortly should fill it. */
  retry: boolean;
  generatedAt: string;
}
