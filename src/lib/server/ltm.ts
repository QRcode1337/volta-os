import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync as DatabaseSyncT } from 'node:sqlite';
import { HttpError } from './http-error';
import { redactSecrets } from './redact';
import { WINDSOR_ROOT } from './storage';
import type { LtmAppCount, LtmCapture, LtmCaptureList, LtmCaptureSummary, LtmDay, LtmStatus } from '@/types/ltm';

// Read-only access to the unvolta-ltm capture database. Never writes.

export const LTM_DB_PATH = process.env.LTM_DB_PATH ?? path.join(WINDSOR_ROOT, 'LTM', 'ltm.sqlite');
export const LTM_FRAMES_DIR = process.env.LTM_FRAMES_DIR ?? path.join(path.dirname(LTM_DB_PATH), 'ltm_frames');

interface Row {
  id: number;
  timestamp: string;
  app_name: string | null;
  window_title: string | null;
  frame_path: string | null;
  content?: string | null;
}

/** Password managers and credential apps: their captures are never shown, searched or served. */
export const HIDDEN_APPS = ['Passwords', 'Keychain Access', '1Password', '1Password 7', 'Bitwarden', 'Proton Pass', 'LastPass', 'Dashlane', 'Enpass', 'KeePassXC', 'Strongbox', 'Authenticator'];

const g = globalThis as unknown as { __ltmDbFiltered?: DatabaseSyncT };

/** Loads node:sqlite at runtime so the bundler never tries to resolve it. */
function openDb(): DatabaseSyncT {
  if (g.__ltmDbFiltered) return g.__ltmDbFiltered;
  if (!fs.existsSync(LTM_DB_PATH)) {
    throw ltmUnavailable(
      fs.existsSync(path.dirname(path.dirname(LTM_DB_PATH)))
        ? `Database not found at ${LTM_DB_PATH}`
        : `Drive not mounted (${path.dirname(path.dirname(LTM_DB_PATH))})`,
    );
  }
  const sqlite = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
  // The ingest job writes in rollback-journal mode; wait briefly for its lock instead of failing at once.
  const db = new sqlite.DatabaseSync(LTM_DB_PATH, { readOnly: true, timeout: 2000 });
  // Unqualified `memory` resolves to the temp schema before main, so this view hides captures of credential apps
  // from every query in this module (lists, search, counts, frames).
  const hidden = HIDDEN_APPS.map((a) => `'${a.replace(/'/g, "''")}'`).join(',');
  db.exec(`CREATE TEMP VIEW memory AS SELECT * FROM main.memory WHERE COALESCE(app_name,'') NOT IN (${hidden})`);
  g.__ltmDbFiltered = db;
  return db;
}

/** LTM can't be reached (drive unmounted, database missing or busy): a 503 with `unavailable: true`. */
export const ltmUnavailable = (message: string) => new HttpError(message, 503, { unavailable: true });
export const isLtmUnavailable = (err: unknown): err is HttpError => err instanceof HttpError && err.extra?.unavailable === true;

/** Run a query; drop the cached handle if the drive went away so the next call reopens. */
function withDb<T>(fn: (db: DatabaseSyncT) => T): T {
  const db = openDb();
  try {
    return fn(db);
  } catch (err) {
    if (!fs.existsSync(LTM_DB_PATH)) {
      try {
        db.close();
      } catch {
        // already gone
      }
      g.__ltmDbFiltered = undefined;
      throw ltmUnavailable('Drive was unmounted');
    }
    if ((err as { errcode?: number }).errcode === 5) throw ltmUnavailable('LTM database is busy (ingest running); try again shortly');
    throw err;
  }
}

const hasFrame = (p: string | null) => !!p && p.length > 0;

function makeSnippet(content: string | null | undefined, query?: string, size = 240): string {
  const text = (content ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (!query) return text.slice(0, size);
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return text.slice(0, size);
  const start = Math.max(0, i - Math.floor((size - query.length) / 2));
  return (start > 0 ? '…' : '') + text.slice(start, start + size) + (start + size < text.length ? '…' : '');
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function toSummary(r: Row, query?: string): LtmCaptureSummary {
  return {
    id: r.id,
    ts: r.timestamp,
    app: r.app_name || 'Unknown',
    title: redactSecrets(r.window_title || ''),
    // Search matches on the raw text; only what is returned is masked (mask first so a window edge can't cut a key).
    snippet: makeSnippet(redactSecrets(r.content ?? ''), query),
    hasFrame: hasFrame(r.frame_path),
  };
}

/** Counts from the memory_pruned table written by unvolta's ltm_prune.py (absent before the first prune). */
function prunedCounts(db: DatabaseSyncT): LtmStatus['pruned'] {
  const exists = db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='memory_pruned'").get();
  if (!exists) return null;
  const rows = db.prepare('SELECT reason, COUNT(*) AS n FROM memory_pruned GROUP BY reason').all() as unknown as { reason: string | null; n: number }[];
  const by = (r: string) => rows.find((x) => x.reason === r)?.n ?? 0;
  const total = rows.reduce((s, x) => s + x.n, 0);
  return { total, duplicate: by('duplicate'), watching: by('watching'), other: total - by('duplicate') - by('watching') };
}

export function getStatus(): LtmStatus {
  const base = { dbPath: LTM_DB_PATH, framesDir: LTM_FRAMES_DIR, framesAvailable: fs.existsSync(LTM_FRAMES_DIR) };
  try {
    return withDb((db) => {
      const r = db
        .prepare('SELECT COUNT(*) AS total, MIN(timestamp) AS first, MAX(timestamp) AS last, COUNT(DISTINCT app_name) AS apps FROM memory')
        .get() as { total: number; first: string | null; last: string | null; apps: number };
      return { available: true, ...base, total: r.total, first: r.first, last: r.last, apps: r.apps, pruned: prunedCounts(db) };
    });
  } catch (err) {
    return { available: false, reason: (err as Error).message, ...base, total: 0, first: null, last: null, apps: 0, pruned: null };
  }
}

export function getDays(topApps = 6): LtmDay[] {
  return withDb((db) => {
    const days = db
      .prepare(
        `SELECT substr(timestamp,1,10) AS date, COUNT(*) AS count, MIN(timestamp) AS firstTs, MAX(timestamp) AS lastTs
         FROM memory GROUP BY 1 ORDER BY 1 DESC`,
      )
      .all() as unknown as Omit<LtmDay, 'apps'>[];
    const apps = db
      .prepare(
        `SELECT substr(timestamp,1,10) AS date, COALESCE(NULLIF(app_name,''),'Unknown') AS app, COUNT(*) AS count
         FROM memory GROUP BY 1, 2 ORDER BY 1, 3 DESC`,
      )
      .all() as unknown as (LtmAppCount & { date: string })[];
    const byDay = new Map<string, LtmAppCount[]>();
    for (const a of apps) {
      const list = byDay.get(a.date) ?? [];
      if (list.length < topApps) list.push({ app: a.app, count: a.count });
      byDay.set(a.date, list);
    }
    return days.map((d) => ({ ...d, apps: byDay.get(d.date) ?? [] }));
  });
}

export function getAppCounts(date?: string): LtmAppCount[] {
  return withDb((db) => {
    const where = date ? 'WHERE timestamp >= ? AND timestamp < ?' : '';
    const params = date ? [date, nextDay(date)] : [];
    return db
      .prepare(`SELECT COALESCE(NULLIF(app_name,''),'Unknown') AS app, COUNT(*) AS count FROM memory ${where} GROUP BY 1 ORDER BY 2 DESC`)
      .all(...params) as unknown as LtmAppCount[];
  });
}

export interface CaptureQuery {
  date?: string; // yyyy-mm-dd
  app?: string;
  q?: string; // substring match on OCR text + window title
  from?: number; // capture id range (inclusive), used by vault session notes
  to?: number;
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
}

export function listCaptures(opts: CaptureQuery): LtmCaptureList {
  return withDb((db) => {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (opts.date) {
      where.push('timestamp >= ? AND timestamp < ?');
      params.push(opts.date, nextDay(opts.date));
    }
    if (opts.app) {
      where.push("COALESCE(NULLIF(app_name,''),'Unknown') = ?");
      params.push(opts.app);
    }
    if (opts.q) {
      where.push("(content LIKE ? ESCAPE '\\' OR window_title LIKE ? ESCAPE '\\')");
      const like = `%${likeEscape(opts.q)}%`;
      params.push(like, like);
    }
    if (opts.from != null) {
      where.push('id >= ?');
      params.push(opts.from);
    }
    if (opts.to != null) {
      where.push('id <= ?');
      params.push(opts.to);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM memory ${w}`).get(...params) as { n: number }).n;
    const limit = Math.min(Math.max(opts.limit ?? 200, 1), 5000);
    const offset = Math.max(opts.offset ?? 0, 0);
    const rows = db
      .prepare(
        `SELECT id, timestamp, app_name, window_title, frame_path, substr(content,1,4000) AS content
         FROM memory ${w} ORDER BY id ${opts.order === 'asc' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as unknown as Row[];
    return { items: rows.map((r) => toSummary(r, opts.q)), total };
  });
}

export function getCapture(id: number): LtmCapture | null {
  return getCaptures([id]).get(id) ?? null;
}

/** Several captures in one query (ids that are missing or hidden are absent from the map). */
export function getCaptures(ids: readonly number[]): Map<number, LtmCapture> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return new Map();
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT id, timestamp, app_name, window_title, frame_path, content,
           (SELECT MAX(p.id) FROM memory p WHERE p.id < m.id) AS prev_id,
           (SELECT MIN(n.id) FROM memory n WHERE n.id > m.id) AS next_id
         FROM memory m WHERE id IN (${uniq.map(() => '?').join(',')})`,
      )
      .all(...uniq) as unknown as (Row & { prev_id: number | null; next_id: number | null })[];
    return new Map(
      rows.map((r): [number, LtmCapture] => [
        r.id,
        {
          ...toSummary(r),
          snippet: '',
          content: redactSecrets(r.content ?? ''),
          framePath: r.frame_path || null,
          prevId: r.prev_id,
          nextId: r.next_id,
        },
      ]),
    );
  });
}

/** Absolute frame path for a capture, only if it resolves inside the frames dir and exists. */
export function resolveFrame(id: number): string | null {
  const framePath = withDb((db) => (db.prepare('SELECT frame_path FROM memory WHERE id = ?').get(id) as { frame_path: string | null } | undefined)?.frame_path);
  if (!framePath) return null;
  const abs = path.resolve(framePath);
  const root = path.resolve(LTM_FRAMES_DIR);
  if (!abs.startsWith(root + path.sep)) return null;
  if (!/\.(jpe?g|png|webp)$/i.test(abs)) return null;
  return fs.existsSync(abs) ? abs : null;
}

export function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const isIsoDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ───────── Aggregates for the home dashboard ─────────

/** Hourly capture counts for the last `n` days that have data (oldest first). */
export function getActivity(n = 14): import('@/types/sources').LtmActivity {
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT substr(timestamp,1,10) AS date, CAST(substr(timestamp,12,2) AS INTEGER) AS hour, COUNT(*) AS c
         FROM memory WHERE timestamp >= date((SELECT MAX(timestamp) FROM memory), ?) GROUP BY 1, 2`,
      )
      .all(`-${n - 1} days`) as unknown as { date: string; hour: number; c: number }[];
    const byDate = new Map<string, number[]>();
    for (const r of rows) {
      const h = byDate.get(r.date) ?? new Array<number>(24).fill(0);
      h[r.hour] = r.c;
      byDate.set(r.date, h);
    }
    return {
      days: [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, hours]) => ({ date, hours, total: hours.reduce((s, x) => s + x, 0) })),
    };
  });
}

/** Today's captures (or the latest day with data): count, app mix, the newest `recent` captures (1–50). */
export function getToday(date?: string, recent = 5): import('@/types/sources').LtmToday {
  return withDb((db) => {
    const day =
      date ?? ((db.prepare('SELECT substr(MAX(timestamp),1,10) AS d FROM memory').get() as { d: string | null }).d ?? '');
    const range = [day, nextDay(day)];
    const agg = db
      .prepare('SELECT COUNT(*) AS n, MIN(timestamp) AS f, MAX(timestamp) AS l FROM memory WHERE timestamp >= ? AND timestamp < ?')
      .get(...range) as { n: number; f: string | null; l: string | null };
    const apps = db
      .prepare(
        `SELECT COALESCE(NULLIF(app_name,''),'Unknown') AS app, COUNT(*) AS count FROM memory
         WHERE timestamp >= ? AND timestamp < ? GROUP BY 1 ORDER BY 2 DESC`,
      )
      .all(...range) as unknown as LtmAppCount[];
    const top = apps.slice(0, 4);
    const other = apps.slice(4).reduce((s, a) => s + a.count, 0);
    const newest = listCaptures({ date: day, limit: Math.min(Math.max(Math.trunc(recent) || 5, 1), 50) }).items;
    return {
      date: day,
      count: agg.n,
      firstTs: agg.f,
      lastTs: agg.l,
      mix: other ? [...top, { app: 'Other', count: other }] : top,
      recent: newest,
    };
  });
}

/** Notion pages ranked by how often their window title was captured. */
export function getNotionTitles(limit = 12): { title: string; visits: number }[] {
  return withDb((db) =>
    (
      db
        .prepare(
          `SELECT window_title AS title, COUNT(*) AS visits FROM memory
           WHERE app_name = 'Notion' AND window_title IS NOT NULL AND TRIM(window_title) != ''
           GROUP BY 1 ORDER BY 2 DESC LIMIT ?`,
        )
        .all(limit) as unknown as { title: string; visits: number }[]
    ).map((r) => ({ title: r.title.trim(), visits: r.visits })),
  );
}

/** Captures with an id above `id` (e.g. not yet summarized by ltm_ingest): count and timestamp range. */
export function capturesAfter(id: number): { count: number; firstTs: string | null; lastTs: string | null } {
  return withDb((db) => {
    const r = db.prepare('SELECT COUNT(*) AS n, MIN(timestamp) AS f, MAX(timestamp) AS l FROM memory WHERE id > ?').get(id) as {
      n: number;
      f: string | null;
      l: string | null;
    };
    return { count: r.n, firstTs: r.f, lastTs: r.l };
  });
}
