import 'server-only';
import type { LibraryRow, SearchResponse } from '@/components/research/types';
import { redactSecrets } from '../redact';
import { inventoryState } from './inventory';
import { getLibrary, type LibRow } from './library';

export interface SearchParams {
  q: string;
  root: string;
  folder: string;
  kind: string;
  storage: string;
  tag: string;
  minNovelty: number | null;
  escalate: boolean;
  contradiction: boolean;
  indexed: boolean;
  sort: 'relevance' | 'novelty' | 'recent' | 'size' | 'name';
  limit: number;
  offset: number;
  rerank: boolean;
}

const RERANK_TOP = 30;
const RERANK_TIMEOUT_MS = 6000;

export function parseParams(url: URL): SearchParams {
  const p = url.searchParams;
  const num = (k: string) => {
    const v = p.get(k);
    if (v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const sort = p.get('sort');
  const q = (p.get('q') ?? '').trim().slice(0, 200);
  return {
    q,
    root: p.get('root') ?? '',
    folder: p.get('folder') ?? '',
    kind: p.get('kind') ?? '',
    storage: p.get('storage') ?? '',
    tag: p.get('tag') ?? '',
    minNovelty: num('minNovelty'),
    escalate: p.get('escalate') === '1',
    contradiction: p.get('contradiction') === '1',
    indexed: p.get('indexed') === '1',
    sort: sort === 'novelty' || sort === 'recent' || sort === 'size' || sort === 'name' || sort === 'relevance' ? sort : q ? 'relevance' : 'recent',
    limit: Math.min(200, Math.max(1, Math.floor(num('limit') ?? 50))),
    offset: Math.max(0, Math.floor(num('offset') ?? 0)),
    rerank: p.get('rerank') === '1',
  };
}

const tokensOf = (q: string) => [...new Set(q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2))].slice(0, 8);

function scoreRow(r: LibRow, toks: string[], phrase: string, requireAll: boolean): number | null {
  let total = 0;
  let missing = 0;
  for (const t of toks) {
    let s = 0;
    const word = ` ${t}`;
    if (r.nameN.includes(word)) s += 6;
    else if (r.nameN.includes(t)) s += 4;
    if (r.titleN.includes(word)) s += 5;
    else if (r.titleN.includes(t)) s += 3;
    if (r.tagsN.includes(t)) s += 4;
    if (r.pathN.includes(t)) s += 1.5;
    if (r.summaryN && r.summaryN.includes(t)) s += 2;
    if (r.claimsN && r.claimsN.includes(t)) s += 1;
    if (s === 0) missing++;
    else total += s;
  }
  if (requireAll ? missing > 0 : missing === toks.length) return null;
  if (!requireAll) total *= 1 - 0.3 * (missing / toks.length);
  if (toks.length > 1 && (r.nameN.includes(phrase) || r.titleN.includes(phrase))) total += 8;
  total += (r.novelty ?? 0) * 1.2 + (r.action === 'escalate' ? 0.6 : 0) + (r.storage === 'local' ? 0.3 : 0);
  return Math.round(total * 100) / 100;
}

/** Index fields stripped; title and summary masked the way /api/research/doc masks them. */
function publicRow(r: LibRow): LibraryRow {
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const { nameN, titleN, tagsN, pathN, summaryN, claimsN, tagKeys, matchedBy, sids, ...row } = r;
  /* eslint-enable @typescript-eslint/no-unused-vars */
  return { ...row, title: redactSecrets(row.title), summary: row.summary ? redactSecrets(row.summary) : null };
}

/** JEV re-rank of the top 30. Any failure (not configured, circuit open, timeout, odd reply) returns null and the plain order stands. */
async function jevRerank(q: string, top: LibRow[]): Promise<LibRow[] | null> {
  try {
    const jev = await import('../jev');
    if (!jev.jevConfigured() || jev.jevCircuit().open) return null;
    const res = await jev.rank(
      {
        items: top.map((r) => ({ id: r.id, text: [r.title, r.tags.join(', '), r.summary ?? '', r.rel].filter(Boolean).join(' | ').slice(0, 600) })),
        criterion: `How relevant this document is to the search query: "${q}"`,
        top: RERANK_TOP,
      },
      { timeoutMs: RERANK_TIMEOUT_MS },
    );
    if (!res.ranked.length) return null;
    const pos = new Map(top.map((r, i) => [r.id, i]));
    const scored = new Map(res.ranked.map((x) => [String(x.id), x.score]));
    return [...top].sort((a, b) => (scored.get(b.id) ?? -1) - (scored.get(a.id) ?? -1) || (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
  } catch {
    return null;
  }
}

export async function search(params: SearchParams): Promise<SearchResponse | { building: true; inventory: ReturnType<typeof inventoryState> }> {
  const lib = await getLibrary();
  if (!lib) return { building: true, inventory: inventoryState() };

  const toks = tokensOf(params.q);
  const phrase = ` ${toks.join(' ')} `;
  const tag = params.tag;
  const base = lib.rows.filter((r) => {
    if (params.root && r.root !== params.root) return false;
    if (params.folder && r.folder !== params.folder) return false;
    if (params.kind && r.kind !== params.kind) return false;
    if (params.storage && r.storage !== params.storage) return false;
    if (tag && !r.tagKeys.includes(tag)) return false;
    if (params.minNovelty !== null && (r.novelty ?? -1) < params.minNovelty) return false;
    if (params.escalate && r.action !== 'escalate') return false;
    if (params.contradiction && !r.contradiction) return false;
    if (params.indexed && !r.sid) return false;
    return true;
  });

  let hits: { r: LibRow; s: number }[];
  if (toks.length) {
    hits = [];
    for (const r of base) {
      const s = scoreRow(r, toks, phrase, true);
      if (s !== null) hits.push({ r, s });
    }
    if (!hits.length && toks.length > 1) {
      for (const r of base) {
        const s = scoreRow(r, toks, phrase, false);
        if (s !== null) hits.push({ r, s });
      }
    }
  } else hits = base.map((r) => ({ r, s: 0 }));

  switch (params.sort) {
    case 'novelty':
      hits.sort((a, b) => (b.r.novelty ?? -1) - (a.r.novelty ?? -1) || b.s - a.s || b.r.mtime - a.r.mtime);
      break;
    case 'size':
      hits.sort((a, b) => b.r.size - a.r.size);
      break;
    case 'name':
      hits.sort((a, b) => a.r.title.localeCompare(b.r.title));
      break;
    case 'recent':
      hits.sort((a, b) => b.r.mtime - a.r.mtime || a.r.name.localeCompare(b.r.name));
      break;
    default:
      hits.sort((a, b) => b.s - a.s || (b.r.novelty ?? -1) - (a.r.novelty ?? -1) || a.r.name.localeCompare(b.r.name));
  }

  let ordered = hits.map((h) => h.r);
  let rerank: SearchResponse['rerank'] = 'off';
  if (params.rerank && toks.length && params.sort === 'relevance' && params.offset === 0 && ordered.length > 1) {
    const top = ordered.slice(0, RERANK_TOP);
    const re = await jevRerank(params.q, top);
    if (re) {
      ordered = [...re, ...ordered.slice(RERANK_TOP)];
      rerank = 'jev';
    } else rerank = 'fallback';
  }
  const score = new Map(hits.map((h) => [h.r.id, h.s]));
  const page = ordered.slice(params.offset, params.offset + params.limit).map((r) => ({ ...publicRow(r), score: toks.length ? score.get(r.id) : undefined }));
  return { total: ordered.length, offset: params.offset, limit: params.limit, rows: page, rerank, inventory: inventoryState(), facets: lib.facets };
}
