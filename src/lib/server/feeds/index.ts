import 'server-only';
import { cached } from '../sources/cache';
import { REFRESH_TTL_MS } from './config';
import { loadFileItems } from './files';
import { loadCronRuns } from './openclaw';
import { labelOf, pruneOld, readState, triageState } from './store';
import { jevState, scheduleTriage } from './triage';
import type { FeedItem, FeedListItem, FeedListResponse, FeedSource } from './types';
import { excerptOf } from './util';

// Aggregates every feed origin into one newest-first list. Incremental: cron runs are loaded from a watermark
// (with overlap so late-finishing runs are picked up), file items are re-parsed only when their mtime changes.

interface Store {
  cron: Map<string, FeedItem>;
  files: FeedItem[];
  consumed: Set<string>;
  watermark: number;
  warnings: string[];
  refreshedAt: number;
}
const g = globalThis as unknown as { __feedsStore?: Store; __feedsForceAt?: number };
const store = (): Store => (g.__feedsStore ??= { cron: new Map(), files: [], consumed: new Set(), watermark: 0, warnings: [], refreshedAt: 0 });
const OVERLAP_MS = 6 * 3600 * 1000;

async function refresh(): Promise<number> {
  const s = store();
  const warnings: string[] = [];
  try {
    const r = loadCronRuns(s.watermark > 0 ? s.watermark - OVERLAP_MS : 0);
    for (const it of r.items) s.cron.set(it.id, it);
    for (const f of r.consumedFiles) s.consumed.add(f);
    s.watermark = Math.max(s.watermark, r.watermark);
  } catch (err) {
    warnings.push(`OpenClaw cron runs: ${(err as Error).message}`);
  }
  try {
    s.files = loadFileItems(s.consumed);
  } catch (err) {
    warnings.push(`Log files: ${(err as Error).message}`);
  }
  s.warnings = warnings;
  s.refreshedAt = Date.now();
  return s.refreshedAt;
}

async function ensureFresh(force: boolean): Promise<Store> {
  // `force` (the Refresh button) is rate-limited to once per 5 s.
  const allow = force && Date.now() - (g.__feedsForceAt ?? 0) > 5_000;
  if (allow) g.__feedsForceAt = Date.now();
  await cached('feeds:refresh', REFRESH_TTL_MS, refresh, { force: allow });
  return store();
}

async function overlay(s: Store): Promise<FeedItem[]> {
  const [read, tri] = await Promise.all([readState().get(), triageState().get()]);
  const out: FeedItem[] = [];
  for (const it of [...s.cron.values(), ...s.files]) {
    const label = !it.triageBy ? labelOf(tri.labels, it.id) : undefined;
    out.push({
      ...it,
      read: !!read.read[it.id],
      triage: label ? label.l : it.triage,
      triageBy: label ? 'jev' : it.triageBy,
      triageConfidence: label ? label.c : null,
    });
  }
  out.sort((a, b) => (a.ranAt === b.ranAt ? (a.id < b.id ? 1 : -1) : a.ranAt < b.ranAt ? 1 : -1));
  return out;
}

const cursorOf = (i: FeedItem) => `${i.ranAt}|${i.id}`;
const toListItem = ({ body, ...rest }: FeedItem): FeedListItem => ({ ...rest, excerpt: excerptOf(body) });

export interface ListQuery {
  source?: string;
  q?: string;
  needsAction?: boolean;
  unread?: boolean;
  cursor?: string;
  limit?: number;
  refresh?: boolean;
}

export async function listFeeds(query: ListQuery): Promise<FeedListResponse> {
  const s = await ensureFresh(!!query.refresh);
  const all = await overlay(s);
  scheduleTriage(all);

  const sources = new Map<string, FeedSource>();
  for (const it of all) {
    let src = sources.get(it.source);
    if (!src) sources.set(it.source, (src = { id: it.source, label: it.sourceLabel, group: it.group, total: 0, unread: 0, needsAction: 0, lastAt: it.ranAt, lastStatus: it.status }));
    src.total++;
    if (!it.read) src.unread++;
    if (!it.read && it.triage === 'needs-action') src.needsAction++;
  }
  const srcList = [...sources.values()].sort((a, b) => (a.group === b.group ? (b.lastAt ?? '').localeCompare(a.lastAt ?? '') : a.group.localeCompare(b.group)));

  const q = query.q?.trim().toLowerCase();
  let rows = all;
  if (query.source) rows = rows.filter((i) => i.source === query.source);
  if (query.needsAction) rows = rows.filter((i) => i.triage === 'needs-action');
  if (query.unread) rows = rows.filter((i) => !i.read);
  if (q) rows = rows.filter((i) => `${i.title}\n${i.body}\n${i.job}\n${i.sourceLabel}`.toLowerCase().includes(q));

  const limit = Math.min(Math.max(query.limit ?? 40, 1), 100);
  let start = 0;
  if (query.cursor) {
    const idx = rows.findIndex((i) => cursorOf(i) < query.cursor!);
    start = idx < 0 ? rows.length : idx;
  }
  const page = rows.slice(start, start + limit);
  const readMeta = readState();
  return {
    items: page.map(toListItem),
    nextCursor: start + limit < rows.length && page.length ? cursorOf(page[page.length - 1]) : null,
    matched: rows.length,
    sources: srcList,
    totals: { total: all.length, unread: all.filter((i) => !i.read).length, needsAction: all.filter((i) => !i.read && i.triage === 'needs-action').length },
    jev: await jevState(all),
    readStore: { persisted: readMeta.persisted, path: readMeta.file, reason: readMeta.reason },
    refreshedAt: new Date(s.refreshedAt).toISOString(),
    warnings: s.warnings,
  };
}

export async function getFeedItem(id: string): Promise<FeedItem | null> {
  const s = await ensureFresh(false);
  return (await overlay(s)).find((i) => i.id === id) ?? null;
}

export interface MarkReadInput {
  ids?: string[];
  source?: string;
  all?: boolean;
  read?: boolean;
}

export async function markRead(input: MarkReadInput): Promise<{ changed: number; persisted: boolean; reason?: string }> {
  const s = await ensureFresh(false);
  const all = await overlay(s);
  const want = input.read !== false;
  const wanted = new Set(input.ids ?? []);
  const targets = all.filter((i) => wanted.has(i.id) || input.all || (input.source && i.source === input.source)).filter((i) => i.read !== want);
  if (!targets.length) return { changed: 0, persisted: readState().persisted, reason: readState().reason };
  const now = new Date().toISOString();
  const res = await readState().update((d) => {
    for (const i of targets) {
      if (want) d.read[i.id] = now;
      else delete d.read[i.id];
    }
    pruneOld(d.read);
  });
  return { changed: targets.length, ...res };
}
