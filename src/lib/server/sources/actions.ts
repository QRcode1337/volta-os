import 'server-only';
// Reads the OpenClaw action pipeline (~/.openclaw/wiki/main/actions.md) and turns it into board items. Writes (status
// moves and notes, the same inline edits Tier 2 makes) live in actions-write.ts.
// Ported from Orchestra OS (parseActionFile / actionCounts), extended with sections, line numbers, dates, links,
// a stable item id and an mtime-keyed parse cache. This module only reads; actions-write.ts makes the edits.
//
// File shape (verified against the live file):
//   ## Open / ## Done                      sections that hold checkbox items
//   - [@] (aging 15d) text (2026-10-09) [[2026-10-09]]
//        aging counter ----^   updated ---^         ^--- captured (daily-note wikilink)
//     - indented detail lines belong to the item above
//   ## Week of YYYY-MM-DD                  rollup prose, no checkboxes: ignored
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cached } from './cache';
import { HttpError } from '../http-error';
import { redactSecrets } from '../redact';
import { isEvicted } from '../icloud';
import { isInside } from '../storage';
import type { ActionCounts, ActionItem, ActionLink, ActionsResponse, ActionsSource, ActionStatus } from '@/components/tasks/types';
import { ACTION_STATUSES } from '@/components/tasks/types';

const DISPLAY_PATH = '~/.openclaw/wiki/main/actions.md';
const FILE = path.join(os.homedir(), '.openclaw', 'wiki', 'main', 'actions.md');
export { FILE as ACTIONS_FILE, DISPLAY_PATH as ACTIONS_DISPLAY_PATH };
/** Reading an iCloud-evicted file fails (EDEADLK) or starts a download, so actions.md is never opened in that state. */
export const ACTIONS_EVICTED = `${DISPLAY_PATH} is an iCloud placeholder (not downloaded to the Mac), so it was not opened. Download it in Finder, then refresh.`;
const OPENCLAW_ROOT = path.join(os.homedir(), '.openclaw');
const MAX_BYTES = 2 * 1024 * 1024;
/** Parse results are memoised per mtime; this only dedupes bursts of requests and re-stats the file. */
const STAT_TTL_MS = 3_000;
const DEFAULT_AGENT = 'OpenClaw';

const STATUS_BY_MARKER: Record<string, ActionStatus> = { ' ': 'todo', '>': 'progress', x: 'done', X: 'done', '!': 'blocked', '@': 'awaiting' };

const ITEM_RE = /^- \[([ >xX!@])\]\s+(.+)$/;
const HEADING_RE = /^##\s+(.+?)\s*$/;
const AGING_RE = /^\(aging (\d+)d\)\s*/;
const CREATED_RE = /\s*\[\[(\d{4}-\d{2}-\d{2})\]\]\s*$/;
const UPDATED_RE = /\s*\((\d{4}-\d{2}-\d{2})\)\s*$/;
const CLAIM_RE = /\b(?:claimed by|owner:|agent:)\s*@?([A-Za-z][\w-]{1,24})\b/i;
const URL_RE = /https?:\/\/[^\s)>\]`]+/g;
const ARXIV_RE = /\barXiv[:\s]*(\d{4}\.\d{4,5})\b/gi;
const BACKTICK_RE = /`([^`\n]+)`/g;

interface Parsed {
  available: boolean;
  reason?: string;
  source: ActionsSource;
  items: Omit<ActionItem, 'ageDays'>[];
}

function emptySource(mtime: Date | null, size: number | null, fm: string | null = null): ActionsSource {
  return { path: DISPLAY_PATH, openHint: `open ${DISPLAY_PATH}`, mtime: mtime ? mtime.toISOString() : null, size, updatedFrontmatter: fm };
}

function stableId(text: string, taken: Set<string>): string {
  const norm = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const base = `act_${createHash('sha1').update(norm).digest('hex').slice(0, 10)}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

function extractLinks(raw: string): ActionLink[] {
  const out: ActionLink[] = [];
  const seen = new Set<string>();
  const add = (l: ActionLink) => {
    const k = `${l.kind}:${l.target}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(l);
    }
  };
  for (const m of raw.matchAll(BACKTICK_RE)) {
    const v = m[1].trim();
    // Only repo-relative wiki paths: `wiki/main/concepts/x.md`. Guard against traversal.
    if (/^wiki\/[\w./-]+\.md$/.test(v) && !v.includes('..')) add({ kind: 'wiki', label: v.split('/').pop() ?? v, target: `~/.openclaw/${v}` });
  }
  for (const m of raw.matchAll(URL_RE)) add({ kind: 'url', label: m[0].replace(/^https?:\/\//, '').replace(/[.,;]+$/, ''), target: m[0].replace(/[.,;]+$/, '') });
  for (const m of raw.matchAll(ARXIV_RE)) add({ kind: 'arxiv', label: `arXiv ${m[1]}`, target: `https://arxiv.org/abs/${m[1]}` });
  return out;
}

function agentFor(status: ActionStatus, text: string): string {
  if (status === 'awaiting') return 'Patrick';
  const claim = status === 'done' ? null : CLAIM_RE.exec(text);
  if (claim && claim[1].toLowerCase() !== 'agent') return claim[1];
  return DEFAULT_AGENT;
}

/** Pure parser (exported for tests). */
export function parseActionsMarkdown(content: string): { items: Parsed['items']; updatedFrontmatter: string | null } {
  const lines = content.split(/\r?\n/);
  const items: Parsed['items'] = [];
  const taken = new Set<string>();
  let section = '';
  let sectionLine = 0;
  let inFrontmatter = lines[0]?.trim() === '---';
  let updatedFrontmatter: string | null = null;
  let current: Parsed['items'][number] | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inFrontmatter) {
      if (i > 0 && line.trim() === '---') inFrontmatter = false;
      else {
        const fm = /^updated:\s*(\S+)/.exec(line);
        if (fm) updatedFrontmatter = fm[1];
      }
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      section = heading[1];
      sectionLine = i + 1;
      current = null;
      continue;
    }
    const m = ITEM_RE.exec(line);
    if (m) {
      const marker = m[1];
      const status = STATUS_BY_MARKER[marker];
      let rest = m[2].trim();
      const links = extractLinks(rest);
      let created: string | null = null;
      let updated: string | null = null;
      let agingDays: number | null = null;
      const c = CREATED_RE.exec(rest);
      if (c) {
        created = c[1];
        rest = rest.slice(0, c.index);
      }
      const u = UPDATED_RE.exec(rest);
      if (u) {
        updated = u[1];
        rest = rest.slice(0, u.index);
      }
      const a = AGING_RE.exec(rest);
      if (a) {
        agingDays = Number(a[1]);
        rest = rest.slice(a[0].length);
      }
      const text = redactSecrets(rest.trim());
      current = {
        id: stableId(text, taken),
        text,
        status,
        marker,
        section,
        sectionLine,
        line: i + 1,
        agent: agentFor(status, text),
        created,
        updated,
        agingDays,
        notes: [],
        links,
      };
      items.push(current);
      continue;
    }
    if (current && /^\s+\S/.test(line)) {
      const note = line.trim().replace(/^[-*]\s+/, '');
      current.notes.push(redactSecrets(note));
      for (const l of extractLinks(note)) if (!current.links.some((x) => x.kind === l.kind && x.target === l.target)) current.links.push(l);
    } else if (line.trim() !== '') {
      current = null; // a non-indented, non-item line closes the item (blank lines do not)
    }
  }
  return { items, updatedFrontmatter };
}

let memo: { mtimeMs: number; size: number; parsed: Parsed } | null = null;

async function loadParsed(): Promise<Parsed> {
  let st;
  try {
    st = await fs.stat(FILE);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    memo = null;
    return { available: false, reason: code === 'ENOENT' ? `${DISPLAY_PATH} does not exist.` : `Cannot read ${DISPLAY_PATH}: ${(err as Error).message}`, source: emptySource(null, null), items: [] };
  }
  if (memo && memo.mtimeMs === st.mtimeMs && memo.size === st.size) return memo.parsed;
  if (isEvicted(st)) return { available: false, reason: ACTIONS_EVICTED, source: emptySource(st.mtime, st.size), items: [] };
  if (st.size > MAX_BYTES) {
    return { available: false, reason: `${DISPLAY_PATH} is larger than ${MAX_BYTES / 1024 / 1024} MB; refusing to parse it.`, source: emptySource(st.mtime, st.size), items: [] };
  }
  const content = await fs.readFile(FILE, 'utf8');
  const { items, updatedFrontmatter } = parseActionsMarkdown(content);
  const parsed: Parsed = { available: true, source: emptySource(st.mtime, st.size, updatedFrontmatter), items };
  memo = { mtimeMs: st.mtimeMs, size: st.size, parsed };
  return parsed;
}

function localToday(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysSince(iso: string | null, today: number): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = Math.round((today - Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) / 86_400_000);
  return d < 0 ? 0 : d;
}

/** actionCounts: by status, by agent and by section. */
export function countActions(items: { status: ActionStatus; agent: string; section: string }[]): ActionCounts {
  const byStatus = Object.fromEntries(ACTION_STATUSES.map((s) => [s, 0])) as Record<ActionStatus, number>;
  const byAgent: Record<string, number> = {};
  const bySection: Record<string, number> = {};
  for (const it of items) {
    byStatus[it.status]++;
    byAgent[it.agent] = (byAgent[it.agent] ?? 0) + 1;
    const sec = it.section || '(none)';
    bySection[sec] = (bySection[sec] ?? 0) + 1;
  }
  return { total: items.length, byStatus, byAgent, bySection };
}

export async function getActions(opts: { refresh?: boolean; countsOnly?: boolean } = {}): Promise<ActionsResponse> {
  const parsed = await cached('actions:parsed', STAT_TTL_MS, loadParsed, { force: opts.refresh });
  const now = new Date();
  const counts = countActions(parsed.items);
  const base = { available: parsed.available, reason: parsed.reason, source: parsed.source, counts, generatedAt: now.toISOString() };
  if (opts.countsOnly) return base;
  const today = localToday(now);
  const items: ActionItem[] = parsed.items.map((it) => ({ ...it, ageDays: daysSince(it.created ?? it.updated, today) }));
  return { ...base, items };
}

// ── Wiki notes the board links to, read-only, so the phone can read them instead of copying a Mac `open` command ──

const WIKI_ROOT = path.join(OPENCLAW_ROOT, 'wiki');
const NOTE_RE = /^wiki\/[\w./-]+\.md$/;
const NOTE_MAX_BYTES = 512 * 1024;

export interface WikiNote {
  /** Display path, home-relative. */
  path: string;
  content: string;
  mtime: string;
  truncated: boolean;
}

/** `rel` is the repo-relative form the board emits (`wiki/main/concepts/x.md`); only files under ~/.openclaw/wiki. */
export async function readWikiNote(rel: string): Promise<WikiNote> {
  if (!NOTE_RE.test(rel) || rel.split('/').includes('..')) throw new HttpError('path must look like wiki/…/note.md', 400);
  let real: string;
  try {
    real = await fs.realpath(path.join(OPENCLAW_ROOT, rel));
  } catch {
    throw new HttpError(`~/.openclaw/${rel} does not exist`, 404);
  }
  if (!(await isInside(real, WIKI_ROOT))) throw new HttpError('path is outside ~/.openclaw/wiki', 400);
  const st = await fs.stat(real);
  if (!st.isFile()) throw new HttpError(`~/.openclaw/${rel} is not a file`, 404);
  if (isEvicted(st)) throw new HttpError(`~/.openclaw/${rel} is in iCloud only (not downloaded to the Mac)`, 409);
  const fh = await fs.open(real, 'r');
  try {
    const buf = Buffer.alloc(Math.min(st.size, NOTE_MAX_BYTES));
    await fh.read(buf, 0, buf.length, 0);
    return { path: `~/.openclaw/${rel}`, content: redactSecrets(buf.toString('utf8')), mtime: st.mtime.toISOString(), truncated: st.size > NOTE_MAX_BYTES };
  } finally {
    await fh.close();
  }
}
