import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { DatabaseSync as DatabaseSyncT } from 'node:sqlite';
import { OPENCLAW_DIR, OPENCLAW_STATE_DB, READABLE_ROOTS, tilde } from './config';
import type { FeedItem, FeedStatus } from './types';
import { NOISE_RE, clean, jobLabel, slug, stableId, titleFrom } from './util';

// OpenClaw cron runs. Read-only: openclaw.sqlite -> cron_jobs (names, delivery) + task_runs (one row per run,
// summary capped at ~2000 chars). For agentTurn runs whose summary hit that cap, the full delivered text is the last
// assistant message of the run's session in the owning agent's own sqlite (transcript_events), read the same way.

const g = globalThis as unknown as { __feedsOcDb?: DatabaseSyncT; __feedsAgentDbs?: Map<string, DatabaseSyncT | null>; __feedsFullText?: Map<string, string | null> };

function sqlite(): typeof import('node:sqlite') {
  return process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
}

function stateDb(): DatabaseSyncT {
  if (g.__feedsOcDb) return g.__feedsOcDb;
  if (!fs.existsSync(OPENCLAW_STATE_DB)) throw new Error(`OpenClaw state not found at ${tilde(OPENCLAW_STATE_DB)}`);
  g.__feedsOcDb = new (sqlite().DatabaseSync)(OPENCLAW_STATE_DB, { readOnly: true });
  return g.__feedsOcDb;
}

function dropDb() {
  try {
    g.__feedsOcDb?.close();
  } catch {
    // already closed
  }
  g.__feedsOcDb = undefined;
}

function agentDb(db: DatabaseSyncT, agentId: string): DatabaseSyncT | null {
  const cache = (g.__feedsAgentDbs ??= new Map());
  if (cache.has(agentId)) return cache.get(agentId) ?? null;
  let handle: DatabaseSyncT | null = null;
  try {
    const row = db.prepare('select path from agent_databases where agent_id = ?').get(agentId) as { path?: string } | undefined;
    const file = row?.path ? path.resolve(OPENCLAW_DIR, row.path) : path.join(OPENCLAW_DIR, 'agents', agentId, 'agent', 'openclaw-agent.sqlite');
    if (file.startsWith(OPENCLAW_DIR + path.sep) && fs.existsSync(file)) handle = new (sqlite().DatabaseSync)(file, { readOnly: true });
  } catch {
    handle = null;
  }
  cache.set(agentId, handle);
  return handle;
}

/** The text the agent actually delivered: its last assistant message. Cached per session (immutable once the run ended). */
function fullDeliveredText(db: DatabaseSyncT, agentId: string, sessionId: string): string | null {
  const cache = (g.__feedsFullText ??= new Map());
  if (cache.has(sessionId)) return cache.get(sessionId) ?? null;
  let out: string | null = null;
  try {
    const adb = agentDb(db, agentId);
    if (adb) {
      const unzstd = (zlib as unknown as { zstdDecompressSync?: (b: Uint8Array) => Buffer }).zstdDecompressSync;
      const rows = adb
        .prepare('select event_json, event_zstd from transcript_events where session_id = ? order by seq desc limit 60')
        .all(sessionId) as { event_json: string | null; event_zstd: Uint8Array | null }[];
      for (const r of rows) {
        let json = r.event_json;
        if (!json && r.event_zstd && unzstd) json = unzstd(r.event_zstd).toString('utf8');
        if (!json || !json.includes('"assistant"')) continue;
        const ev = JSON.parse(json) as { type?: string; message?: { role?: string; content?: { type?: string; text?: string }[] | string } };
        if (ev.type !== 'message' || ev.message?.role !== 'assistant') continue;
        const c = ev.message.content;
        const text = typeof c === 'string' ? c : (c ?? []).filter((p) => p.type === 'text' && p.text).map((p) => p.text).join('\n');
        if (text.trim()) {
          out = text;
          break;
        }
      }
    }
  } catch {
    out = null;
  }
  if (cache.size > 300) cache.clear();
  cache.set(sessionId, out);
  return out;
}

interface JobRow {
  job_id: string;
  name: string;
  agent_id: string | null;
  payload_kind: string;
  enabled: number;
  job_json: string;
}
interface RunRow {
  task_id: string;
  source_id: string;
  agent_id: string | null;
  status: string;
  created_at: number;
  ended_at: number | null;
  error: string | null;
  terminal_summary: string | null;
  detail_json: string | null;
}
interface Detail {
  status?: string;
  summary?: string;
  error?: string | null;
  delivered?: boolean;
  deliveryStatus?: string;
  delivery?: { resolved?: { channel?: string } };
  sessionId?: string;
  durationMs?: number;
  model?: string;
  provider?: string;
}

const FILE_SUMMARY_RE = /(?:^|\n)\s*(?:Wrote|Log|Report):\s*(\/[^\s`]+\.(?:md|txt))/i;

function inlineFile(summary: string): { text: string; file: string } | null {
  const m = summary.match(FILE_SUMMARY_RE);
  if (!m || summary.length > 500) return null;
  try {
    const file = fs.realpathSync(m[1]);
    if (!READABLE_ROOTS.some((r) => file.startsWith(r + path.sep))) return null;
    if (/(discord|telegram)-archive/.test(file)) return null; // raw chat dumps: link only
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > 60_000) return null;
    return { text: fs.readFileSync(file, 'utf8'), file };
  } catch {
    return null;
  }
}

function mapStatus(task: string, detailStatus: string | undefined, error: string | null): FeedStatus {
  if (/^heartbeat skipped|^skipped/i.test(error ?? '') || detailStatus === 'skipped') return 'skipped';
  if (detailStatus === 'error' || ['failed', 'timed_out', 'lost'].includes(task)) return 'error';
  if (task === 'cancelled') return 'skipped';
  return 'ok';
}

export interface CronLoad {
  items: FeedItem[];
  consumedFiles: Set<string>;
  /** created_at of the newest run seen (the next incremental load starts a little before it). */
  watermark: number;
}

/** Cron runs created after `since` (ms). Heartbeat jobs are infrastructure noise and are not feed items. */
export function loadCronRuns(since: number): CronLoad {
  let db: DatabaseSyncT;
  try {
    db = stateDb();
    const jobs = new Map<string, JobRow>();
    for (const j of db.prepare('select job_id, name, agent_id, payload_kind, enabled, job_json from cron_jobs').all() as unknown as JobRow[]) jobs.set(j.job_id, j);
    const rows = db
      .prepare(
        `select task_id, source_id, agent_id, status, created_at, ended_at, error, terminal_summary, detail_json
         from task_runs where runtime = 'cron' and task_kind = 'automation_run' and created_at > ? order by created_at desc`,
      )
      .all(since) as unknown as RunRow[];
    const items: FeedItem[] = [];
    const consumedFiles = new Set<string>();
    let watermark = since;
    for (const r of rows) {
      watermark = Math.max(watermark, r.created_at);
      const job = jobs.get(r.source_id);
      if (job?.payload_kind === 'heartbeat') continue;
      const name = job?.name ?? `Retired job ${r.source_id.slice(0, 8)}`;
      const label = jobLabel(name);
      let d: Detail = {};
      try {
        d = r.detail_json ? (JSON.parse(r.detail_json) as Detail) : {};
      } catch {
        d = {};
      }
      let summary = (d.summary ?? r.terminal_summary ?? '').trim();
      const agent = r.agent_id ?? job?.agent_id ?? null;
      if (summary.length >= 1900 && d.sessionId && agent && job?.payload_kind === 'agentTurn') {
        const full = fullDeliveredText(db, agent, d.sessionId);
        if (full && full.length > summary.length) summary = full.trim();
      }
      const err = (d.error ?? r.error ?? '').trim();
      const status = mapStatus(r.status, d.status, err);
      const link = summary.match(/(\/Users\/[^\s`'"<>)]+\.(?:md|txt|json|log))/)?.[1] ?? null;
      let body = summary;
      let title: string | null = null;
      const inl = inlineFile(summary);
      if (inl) {
        consumedFiles.add(inl.file);
        body = inl.text;
        title = `${label}: ${titleFrom(inl.text, label)}`;
      }
      if (err && status !== 'ok') body = `${body ? `${body}\n\n` : ''}**Error:** ${err}`;
      if (!body) body = status === 'ok' ? '_The run finished without any output._' : `_${label} run ${status}._`;
      const ranAt = new Date(r.created_at).toISOString();
      const noisy = NOISE_RE.test(summary);
      const item: FeedItem = {
        id: stableId('c', r.task_id),
        source: slug(label),
        sourceLabel: label,
        group: 'OpenClaw cron',
        origin: 'openclaw-cron',
        job: name,
        agent,
        ranAt,
        status,
        title: clean(title ?? (noisy ? `${label}: nothing to report` : status === 'ok' ? titleFrom(summary, `${label} run`) : titleFrom(err || summary, `${label} run ${status}`)), 140),
        body: clean(body),
        link: link ? tilde(link) : `~/.openclaw/state/openclaw.sqlite · cron ${r.source_id.slice(0, 8)}`,
        delivery: d.deliveryStatus ?? (d.delivered === true ? 'delivered' : null),
        durationMs: typeof d.durationMs === 'number' ? d.durationMs : r.ended_at ? r.ended_at - r.created_at : null,
        model: d.model ? (d.provider ? `${d.provider}/${d.model}` : d.model) : null,
        read: false,
        triage: null,
        triageBy: null,
        triageConfidence: null,
      };
      if (noisy) {
        item.triage = 'noise';
        item.triageBy = 'rule';
      } else if (status === 'error') {
        item.triage = 'needs-action';
        item.triageBy = 'rule';
      }
      items.push(item);
    }
    return { items, consumedFiles, watermark };
  } catch (err) {
    dropDb();
    throw err;
  }
}
