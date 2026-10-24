import 'server-only';
import { HonchoOfflineError } from '../honcho';
import { LtmUnavailableError } from '../ltm';
import { cached } from '../sources/cache';
import { getSkills } from '../sources/skills';
import { getNotesIndex, notesIndexProgress } from './notes-index';
import {
  SourceOffline,
  searchClaudeMem,
  searchHoncho,
  searchLtm,
  searchMcp,
  searchNotion,
  searchRoutines,
  searchSkills,
  searchVaultNotes,
  type SourceContext,
  type SourceOutput,
} from './sources';
import { SourceTimeout, parseQuery, withTimeout } from './text';
import { SEARCH_SOURCE_IDS, type SearchMode, type SearchResponse, type SearchSourceId, type SearchSourceResult } from './types';

// VOLTA Search: one query fanned out to every memory source in parallel, each under its own time budget.

export const SOURCE_TIMEOUT_MS = 2_500;
export const MIN_QUERY_CHARS = 2;
/** claude-mem and Honcho message search run embeddings per query: only for 3+ characters. */
export const SEMANTIC_MIN_CHARS = 3;
export const MAX_LIMIT = 50;

const SOURCES: Record<SearchSourceId, { label: string; mode: SearchMode; semantic?: boolean; warms?: string; run: (ctx: SourceContext, semanticOk: boolean) => Promise<SourceOutput> }> = {
  ltm: { label: 'LTM captures', mode: 'phrase', run: searchLtm },
  notes: { label: 'Obsidian notes', mode: 'substring', warms: 'building the notes index', run: searchVaultNotes },
  'claude-mem': { label: 'claude-mem', mode: 'semantic', semantic: true, run: searchClaudeMem },
  honcho: { label: 'Honcho', mode: 'semantic', run: searchHoncho },
  notion: { label: 'Notion', mode: 'name', warms: 'loading Notion titles', run: searchNotion },
  skills: { label: 'Skills', mode: 'name', warms: 'scanning transcripts for skill usage', run: searchSkills },
  routines: { label: 'Routines', mode: 'name', warms: 'loading the routine list', run: searchRoutines },
  mcp: { label: 'MCP servers', mode: 'name', run: searchMcp },
};

const fmt = (n: number) => n.toLocaleString('en-US');

async function runSource(id: SearchSourceId, ctx: SourceContext): Promise<SearchSourceResult> {
  const def = SOURCES[id];
  const t0 = performance.now();
  const base = { source: id, label: def.label, mode: def.mode };
  const ms = () => Math.round(performance.now() - t0);
  const semanticOk = ctx.pq.q.length >= SEMANTIC_MIN_CHARS;
  if (def.semantic && !semanticOk) {
    return { ...base, status: 'skipped', ms: 0, total: null, hits: [], note: `Semantic search runs for ${SEMANTIC_MIN_CHARS}+ characters` };
  }
  try {
    const out = await withTimeout(def.run(ctx, semanticOk), SOURCE_TIMEOUT_MS);
    return { ...base, status: out.status ?? 'ok', ms: ms(), total: out.total, hits: out.hits, note: out.note ?? null };
  } catch (err) {
    if (err instanceof SourceTimeout) {
      let note = `No answer within ${SOURCE_TIMEOUT_MS / 1000}s`;
      if (id === 'notes') {
        const p = notesIndexProgress();
        if (p.building) note = `Building the notes index (${fmt(p.done)} / ${fmt(p.total)} notes read) — results appear when it finishes`;
      } else if (def.warms) note = `${note} — ${def.warms}; it keeps running and the next search uses it`;
      return { ...base, status: 'timeout', ms: ms(), total: null, hits: [], note };
    }
    if (err instanceof SourceOffline || err instanceof LtmUnavailableError || err instanceof HonchoOfflineError) {
      return { ...base, status: 'offline', ms: ms(), total: null, hits: [], note: err.message };
    }
    if (!ctx.signal.aborted) console.error(`[volta search] ${id} failed`, err);
    return { ...base, status: 'error', ms: ms(), total: null, hits: [], note: ((err as Error).message || 'failed').slice(0, 200) };
  }
}

// Short-lived response cache: backspacing / reopening the palette repeats queries within seconds.
const RESULT_TTL_MS = 30_000;
const RESULT_MAX = 40;
const results = ((globalThis as unknown as { __voltaSearchResults?: Map<string, { at: number; value: SearchResponse }> }).__voltaSearchResults ??= new Map());

export function parseSources(raw: string | null): SearchSourceId[] {
  if (!raw) return SEARCH_SOURCE_IDS;
  const want = new Set(raw.split(',').map((s) => s.trim()));
  const picked = SEARCH_SOURCE_IDS.filter((id) => want.has(id));
  return picked.length ? picked : SEARCH_SOURCE_IDS;
}

export async function search(opts: { q: string; sources?: SearchSourceId[]; limit?: number; signal?: AbortSignal }): Promise<SearchResponse> {
  const t0 = performance.now();
  const pq = parseQuery(opts.q);
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 8) || 8, 1), MAX_LIMIT);
  const ids = opts.sources?.length ? opts.sources : SEARCH_SOURCE_IDS;
  const empty = (): SearchResponse => ({ q: pq.q, terms: pq.terms, tookMs: 0, sources: [], retry: false, generatedAt: new Date().toISOString() });
  if (pq.q.length < MIN_QUERY_CHARS) return empty();

  const key = `${pq.phrase}\u0000${limit}\u0000${ids.join(',')}`;
  const hit = results.get(key);
  // The cached value was computed for the first caller's spelling of the query: return this caller's own.
  if (hit && Date.now() - hit.at < RESULT_TTL_MS) return { ...hit.value, q: pq.q, terms: pq.terms };

  const ctx: SourceContext = { pq, limit, signal: opts.signal ?? new AbortController().signal };
  const sources = await Promise.all(ids.map((id) => runSource(id, ctx)));
  const value: SearchResponse = {
    q: pq.q,
    terms: pq.terms,
    tookMs: Math.round(performance.now() - t0),
    sources,
    retry: sources.some((s) => s.status === 'timeout' && !!SOURCES[s.source].warms),
    generatedAt: new Date().toISOString(),
  };
  // A client abort (every new keystroke) fails the sources that were using its signal: never cache that.
  if (!ctx.signal.aborted && !sources.some((s) => s.status === 'timeout')) {
    results.delete(key);
    results.set(key, { at: Date.now(), value });
    while (results.size > RESULT_MAX) results.delete(results.keys().next().value as string);
  }
  return value;
}

/** Start the lazy builds (notes index, skills list) so the first real query is fast. Never waits. */
export function warmSearch(): { warming: string[] } {
  getNotesIndex().catch((err) => console.error('[volta search] notes index build failed', err));
  cached('search:skills', 10 * 60_000, getSkills).catch(() => {});
  return { warming: ['notes', 'skills'] };
}
