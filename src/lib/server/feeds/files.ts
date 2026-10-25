import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { ERISMORN_MEMORY, FILE_ITEMS_PER_DIR, HEALTH_DIR, HERMES_DIR, HERMES_ITEMS, tilde } from './config';
import type { FeedGroup, FeedItem, FeedOrigin, FeedStatus } from './types';
import { NOISE_RE, clean, slug, stableId, titleFrom } from './util';

// File-backed outputs: ErisMorn memory logs (Sentinel / Scout / Curator / COMPRESSOR), Cron Health Supervisor
// REPORT-*.md, and Hermes cron outputs. Parsed once per (path, mtime) and kept in memory; files are never written.

interface Spec {
  dir: string;
  match: RegExp;
  source: string;
  label: string;
  group: FeedGroup;
  origin: FeedOrigin;
  limit: number;
}

const MEMORY_SPECS: Spec[] = [
  { dir: path.join(ERISMORN_MEMORY, 'sentinel'), match: /^\d{4}-\d{2}-\d{2}\.md$/, source: 'sentinel-log', label: 'Sentinel log', group: 'ErisMorn memory', origin: 'memory-file', limit: FILE_ITEMS_PER_DIR },
  { dir: path.join(ERISMORN_MEMORY, 'scout'), match: /^\d{4}-\d{2}-\d{2}\.md$/, source: 'scout-log', label: 'Scout log', group: 'ErisMorn memory', origin: 'memory-file', limit: FILE_ITEMS_PER_DIR },
  { dir: path.join(ERISMORN_MEMORY, 'curated'), match: /^\d{4}-\d{2}-\d{2}-synthesis\.md$/, source: 'curator-synthesis', label: 'Curator synthesis', group: 'ErisMorn memory', origin: 'memory-file', limit: FILE_ITEMS_PER_DIR },
  { dir: path.join(ERISMORN_MEMORY, 'daily'), match: /^\d{4}-\d{2}-\d{2}-compressor\.md$/, source: 'compressor-log', label: 'COMPRESSOR log', group: 'ErisMorn memory', origin: 'memory-file', limit: 14 },
  { dir: HEALTH_DIR, match: /^REPORT-\d{4}-\d{2}-\d{2}\.md$/, source: 'cron-health-report', label: 'Cron Health report', group: 'OpenClaw health', origin: 'health-report', limit: FILE_ITEMS_PER_DIR },
];

/** Bump when the parsing changes so a long-running server drops items parsed by the old code. */
const PARSER_VERSION = 2;
type Parsed = { item: FeedItem | null; mtimeMs: number; v: number };
const g = globalThis as unknown as { __feedsFileCache?: Map<string, Parsed> };
const cache = () => (g.__feedsFileCache ??= new Map());

function base(over: Partial<FeedItem> & Pick<FeedItem, 'id' | 'source' | 'sourceLabel' | 'group' | 'origin' | 'job' | 'ranAt' | 'title' | 'body'>): FeedItem {
  return { agent: null, status: 'ok', link: null, delivery: null, durationMs: null, model: null, read: false, triage: null, triageBy: null, triageConfidence: null, ...over };
}

const dateOf = (name: string): string => name.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '';

function memoryItem(spec: Spec, file: string, mtimeMs: number): FeedItem | null {
  const raw = fs.readFileSync(file, 'utf8');
  const date = dateOf(path.basename(file));
  const text = raw.replace(/<!--.*?-->/g, '').trim();
  if (!text) return null;
  const sections = text.match(/^##\s+(SENTINEL|SCOUT)\b/gm)?.length ?? 0;
  const first = titleFrom(text.replace(/^#{1,6}\s+.*$/m, ''), '');
  let status: FeedStatus = 'ok';
  if (spec.origin === 'health-report' && /\*\*Status:\*\*\s*error/i.test(text)) status = 'error';
  const title = [`${spec.label} ${date}`, sections > 1 ? `${sections} scans` : '', first].filter(Boolean).join(' · ');
  return base({
    id: stableId('f', file),
    source: spec.source,
    sourceLabel: spec.label,
    group: spec.group,
    origin: spec.origin,
    job: spec.label,
    ranAt: new Date(mtimeMs).toISOString(),
    status,
    title: clean(title, 150),
    body: clean(text),
    link: tilde(file),
  });
}

/** `# Cron Job: name` header + `## Response` section (Hermes .md), or `Cronjob Response:` preamble (profile .txt). */
function hermesItem(file: string, mtimeMs: number): FeedItem | null {
  const raw = fs.readFileSync(file, 'utf8');
  const isMd = file.endsWith('.md');
  const name = (isMd ? raw.match(/^#\s*Cron Job:\s*(.+)$/m)?.[1] : raw.match(/^Cronjob Response:\s*(.+)$/m)?.[1])?.trim();
  const jobId = raw.match(/job_id:\s*([0-9a-f]+)/i)?.[1] ?? raw.match(/\*\*Job ID:\*\*\s*([0-9a-f]+)/i)?.[1] ?? path.basename(path.dirname(file)).slice(0, 12);
  const profile = file.match(/\/profiles\/([^/]+)\/cron\//)?.[1] ?? null;
  const failed = /\(FAILED\)/i.test(name ?? '') || /^##\s+Error\s*$/m.test(raw);
  const jobName = (name ?? '').replace(/\s*\(FAILED\)\s*$/i, '').replace(/\s+/g, ' ').trim() || `Hermes job ${jobId}`;
  let body = raw;
  if (isMd) {
    const resp = raw.search(/^##\s+Response\s*$/m);
    const err = raw.search(/^##\s+Error\s*$/m);
    if (resp >= 0) body = raw.slice(resp).replace(/^##\s+Response\s*\n/, '');
    else if (err >= 0) body = raw.slice(err).replace(/^##\s+Error\s*\n/, '**Error**\n');
    else body = raw;
  } else {
    body = raw.replace(/^Cronjob Response:.*\n(?:\(job_id:.*\)\n)?-+\n/, '');
  }
  body = body.trim();
  // timestamp from the name (local time): 2026-05-04_09-02-49.md or <id>_20260703_080604.txt
  const m1 = path.basename(file).match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  const m2 = path.basename(file).match(/_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  const m = m1 ?? m2;
  const when = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : mtimeMs;
  const sourceId = `hermes-${slug(profile ?? 'briefings')}`;
  const sourceLabel = profile ? `Hermes · ${profile}` : 'Hermes · briefings';
  const noisy = NOISE_RE.test(body);
  const item = base({
    id: stableId('h', file),
    source: sourceId,
    sourceLabel,
    status: failed ? 'error' : 'ok',
    group: 'Hermes',
    origin: 'hermes-cron',
    job: jobName,
    agent: profile ?? 'hermes',
    ranAt: new Date(when).toISOString(),
    title: clean(
      noisy ? `${jobName}: nothing to report` : failed ? `${jobName} failed: ${titleFrom(body.replace(/^\*\*Error\*\*\s*/, '').replace(/`{3}/g, ''), 'error')}` : titleFrom(body.replace(/^[═─=\-\s]+$/gm, ''), jobName),
      140,
    ),
    body: clean(body || '_Empty output._'),
    link: tilde(file),
  });
  if (noisy) {
    item.triage = 'noise';
    item.triageBy = 'rule';
  } else if (failed) {
    item.triage = 'needs-action';
    item.triageBy = 'rule';
  }
  return item;
}

function listDir(dir: string, match: RegExp): { file: string; mtimeMs: number }[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: { file: string; mtimeMs: number }[] = [];
  for (const n of names) {
    if (!match.test(n)) continue;
    const file = path.join(dir, n);
    try {
      const st = fs.statSync(file);
      if (st.isFile()) out.push({ file, mtimeMs: st.mtimeMs });
    } catch {
      // vanished between readdir and stat
    }
  }
  return out;
}

function parseCached(file: string, mtimeMs: number, make: () => FeedItem | null): FeedItem | null {
  const c = cache();
  const hit = c.get(file);
  if (hit && hit.mtimeMs === mtimeMs && hit.v === PARSER_VERSION) return hit.item;
  let item: FeedItem | null = null;
  try {
    item = make();
  } catch (err) {
    console.error('[volta feeds] could not parse', file, (err as Error).message);
  }
  c.set(file, { item, mtimeMs, v: PARSER_VERSION });
  return item;
}

export function loadFileItems(consumed: Set<string>): FeedItem[] {
  const items: FeedItem[] = [];
  const live = new Set<string>();
  for (const spec of MEMORY_SPECS) {
    const files = listDir(spec.dir, spec.match)
      .sort((a, b) => path.basename(b.file).localeCompare(path.basename(a.file)))
      .slice(0, spec.limit);
    for (const f of files) {
      live.add(f.file);
      if (consumed.has(f.file)) continue; // already inlined into its cron run item
      const it = parseCached(f.file, f.mtimeMs, () => memoryItem(spec, f.file, f.mtimeMs));
      if (it) items.push(it);
    }
  }
  const hermes = [
    ...subdirs(path.join(HERMES_DIR, 'cron', 'output')).flatMap((d) => listDir(d, /\.md$/)),
    ...safeProfiles().flatMap((p) => listDir(path.join(HERMES_DIR, 'profiles', p, 'cron', 'output'), /\.txt$/)),
  ]
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, HERMES_ITEMS);
  for (const f of hermes) {
    live.add(f.file);
    const it = parseCached(f.file, f.mtimeMs, () => hermesItem(f.file, f.mtimeMs));
    if (it) items.push(it);
  }
  // forget files that rolled out of the window
  const c = cache();
  for (const k of c.keys()) if (!live.has(k)) c.delete(k);
  return items;
}

function subdirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(dir, d.name));
  } catch {
    return [];
  }
}

function safeProfiles(): string[] {
  try {
    return fs.readdirSync(path.join(HERMES_DIR, 'profiles'));
  } catch {
    return [];
  }
}
