import 'server-only';
import type { NotionPageDoc, NotionPageRef, NotionSection } from '@/types/notion';
import { cached } from '../sources/cache';
import { listChildren, notionGet, pageTitle, pageUrl, stripDashes, NotionError, type RawBlock, type RawPage } from './client';
import { blocksToMarkdown, type BlockNode } from './markdown';

// Page fetch: metadata + recursive block tree → Markdown, split into sections. Cached ≥10 min, stale-while-revalidate
// (a page edited in Notion shows up on the next read after the TTL; the old copy is served meanwhile).

export const TTL_MS = 10 * 60_000;
const MAX_STALE_MS = 24 * 3_600_000;
const MAX_BLOCKS = 1500; // per page; a hard stop so a pathological page cannot hold the rate limiter for minutes
const MAX_DEPTH = 8;
const NO_RECURSE = new Set(['child_page', 'child_database', 'unsupported']);

interface Budget {
  left: number;
  hit: boolean;
}

async function fetchTree(blockId: string, depth: number, budget: Budget): Promise<BlockNode[]> {
  const raw = await listChildren(blockId);
  const nodes: BlockNode[] = [];
  for (const b of raw) {
    if (budget.left <= 0) {
      budget.hit = true;
      break;
    }
    budget.left--;
    nodes.push({ ...(b as RawBlock), kids: [] });
  }
  await Promise.all(
    nodes.map(async (n) => {
      if (!n.has_children || NO_RECURSE.has(n.type)) return;
      if (depth >= MAX_DEPTH) {
        budget.hit = true;
        return;
      }
      n.kids = await fetchTree(n.id, depth + 1, budget);
    }),
  );
  return nodes;
}

/** Top-level child blocks of a page, without recursing (index parsing). */
export async function fetchTopBlocks(pageId: string): Promise<RawBlock[]> {
  return listChildren(pageId);
}

export async function fetchPageMeta(id: string): Promise<{ title: string; lastEdited: string | null; page: RawPage }> {
  const page = await notionGet<RawPage>(`/pages/${stripDashes(id)}`);
  return { title: pageTitle(page) || 'Untitled', lastEdited: page.last_edited_time ?? null, page };
}

/** Split Markdown into chapters. The chapter level is the shallowest heading level used at least twice (else the shallowest). */
export function splitSections(markdown: string): NotionSection[] {
  const lines = markdown.split('\n');
  const heads: { at: number; level: number; title: string }[] = [];
  let fence = false;
  lines.forEach((line, i) => {
    if (/^```/.test(line)) fence = !fence;
    if (fence) return;
    const m = line.match(/^(#{1,3}) +(.+)$/);
    if (m) heads.push({ at: i, level: m[1].length, title: m[2].trim() });
  });
  if (!heads.length) return markdown.trim() ? [{ id: 's0', title: 'Document', level: 0, markdown: markdown.trim() }] : [];
  const counts = [0, 0, 0, 0];
  heads.forEach((h) => counts[h.level]++);
  const level = [1, 2, 3].find((l) => counts[l] >= 2) ?? heads[0].level;
  const marks = heads.filter((h) => h.level <= level);
  const out: NotionSection[] = [];
  const lead = lines.slice(0, marks[0].at).join('\n').trim();
  if (lead) out.push({ id: 's0', title: 'Overview', level: 0, markdown: lead });
  marks.forEach((h, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].at : lines.length;
    out.push({ id: `s${out.length}`, title: h.title.replace(/[*_`]/g, ''), level: h.level, markdown: lines.slice(h.at + 1, end).join('\n').trim() });
  });
  return out;
}

async function loadPage(id: string): Promise<NotionPageDoc> {
  const pid = stripDashes(id);
  const [meta, tree] = await Promise.all([fetchPageMeta(pid), (async () => {
    const budget: Budget = { left: MAX_BLOCKS, hit: false };
    const nodes = await fetchTree(pid, 0, budget);
    return { nodes, budget };
  })()]);
  const { markdown, children } = blocksToMarkdown(tree.nodes);
  return {
    id: pid,
    title: meta.title,
    url: pageUrl(pid),
    lastEdited: meta.lastEdited,
    markdown,
    sections: splitSections(markdown),
    children: children.filter((c) => c.id !== pid),
    truncated: tree.budget.hit,
    fetchedAt: new Date().toISOString(),
  };
}

export function getPage(id: string, opts: { force?: boolean } = {}): Promise<NotionPageDoc> {
  const pid = stripDashes(id);
  return cached(`notion:page:${pid}`, TTL_MS, () => loadPage(pid), { maxStaleMs: MAX_STALE_MS, force: opts.force });
}

/** Like getPage but resolves null for pages the integration cannot see (404/403); other errors still throw. */
export async function getPageOrNull(id: string): Promise<NotionPageDoc | null> {
  try {
    return await getPage(id);
  } catch (err) {
    if (err instanceof NotionError && err.noAccess) return null;
    throw err;
  }
}

export const NO_ACCESS_HINT = 'Share this page with the VOLTA integration (Notion → ••• → Connections → VOLTA).';

export type { NotionPageRef };
