import 'server-only';
import type { FeedItem, FeedTriage } from './types';

// One list instead of a pile per cron: the same news coming from several jobs (or the same job every day) becomes a
// single row with a repeat count.
// 1. A job's run summary is folded into that day's log file from the same job (Sentinel run -> Sentinel log), since
//    the log already holds what the run found. Failed runs stay separate.
// 2. Task-list chatter (Action Capture / Orchestrate / Digest / Weekly Rollup) is left out: Tasks shows those items.
//    Failed runs of those jobs still show.
// 3. Rows whose titles say the same thing, ignoring dates, times, counts, paths and job names, are merged; the newest
//    stands for the group.

export interface MergedRow {
  item: FeedItem;
  repeat: number;
  firstAt: string;
  memberIds: string[];
  /** Every source label in the group (the representative's first). */
  from: string[];
}

const TASK_SOURCES = new Set(['action-capture', 'action-orchestrate', 'action-digest', 'weekly-rollup']);

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'was', 'are', 'has', 'have', 'not', 'but', 'its', 'into', 'all', 'any', 'via', 'per']);
const DATE_WORDS =
  /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b|\b(est|edt|utc|gmt|am|pm|today|tonight|morning|evening)\b/g;

const nyDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayOf = (iso: string) => nyDay.format(new Date(iso));

function tokens(it: FeedItem): string[] {
  let t = it.title.toLowerCase();
  // job names say who reported it, not what was reported ("Argus Daily Briefing failed: X" == "daily-argus-briefing failed: X")
  for (const name of [it.job, it.sourceLabel]) {
    const n = name.toLowerCase().trim();
    if (n.length >= 4) t = t.split(n).join(' ');
  }
  t = t.replace(/(~|\/)[^\s]*/g, ' ').replace(DATE_WORDS, ' ').replace(/[0-9]+/g, ' ').replace(/[^a-z]+/g, ' ');
  return [...new Set(t.split(' ').filter((w) => w.length >= 3 && !STOP.has(w)))].sort();
}

const SEVERITY: Record<FeedTriage, number> = { 'needs-action': 2, fyi: 1, noise: 0 };
const worse = (a: FeedTriage | null, b: FeedTriage | null) => ((b ? SEVERITY[b] : -1) > (a ? SEVERITY[a] : -1) ? b : a);

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

/** `items` newest first. Returns rows newest first and how many task-list updates were left out. */
export function mergeFeed(items: FeedItem[]): { rows: MergedRow[]; hiddenTaskUpdates: number } {
  let hiddenTaskUpdates = 0;
  const kept = items.filter((it) => {
    if (TASK_SOURCES.has(it.source) && it.status !== 'error') {
      hiddenTaskUpdates++;
      return false;
    }
    return true;
  });

  // 1. fold run summaries into the same-day log of the same job
  const logs = new Map<string, FeedItem>();
  for (const it of kept) {
    if (it.origin !== 'memory-file') continue;
    const key = `${it.sourceLabel.replace(/\s+(log|synthesis)$/i, '').toLowerCase()}|${dayOf(it.ranAt)}`;
    if (!logs.has(key)) logs.set(key, it);
  }
  const absorbed = new Map<string, FeedItem[]>();
  const units = kept.filter((it) => {
    if (it.origin !== 'openclaw-cron' || it.status === 'error') return true;
    const log = logs.get(`${it.sourceLabel.toLowerCase()}|${dayOf(it.ranAt)}`);
    if (!log) return true;
    absorbed.set(log.id, [...(absorbed.get(log.id) ?? []), it]);
    return false;
  });

  // 2. merge rows that say the same thing
  interface Group { rep: FeedItem; key: string; toks: Set<string>; failed: boolean; members: FeedItem[]; repeat: number }
  const groups: Group[] = [];
  const byKey = new Map<string, Group>();
  for (const it of units) {
    const toks = tokens(it);
    const key = toks.join(' ');
    const failed = it.status === 'error';
    const members = [it, ...(absorbed.get(it.id) ?? [])];
    let g = toks.length ? byKey.get(`${failed}|${key}`) : undefined;
    // daily logs carry new findings under a similar heading, so they only merge when identical
    if (!g && toks.length >= 3 && it.origin !== 'memory-file') {
      const set = new Set(toks);
      g = groups.find((x) => x.failed === failed && x.rep.origin !== 'memory-file' && x.toks.size >= 3 && jaccard(x.toks, set) >= 0.6);
    }
    if (g) {
      g.members.push(...members);
      g.repeat++;
      continue;
    }
    g = { rep: it, key, toks: new Set(toks), failed, members, repeat: 1 };
    groups.push(g);
    if (toks.length) byKey.set(`${failed}|${key}`, g);
  }

  const rows = groups.map((g): MergedRow => {
    const from = [...new Set([g.rep.sourceLabel, ...g.members.map((m) => m.sourceLabel)])];
    const triage = g.members.filter((m) => !m.read).reduce<FeedTriage | null>((t, m) => worse(t, m.triage), null) ?? g.rep.triage;
    return {
      item: { ...g.rep, read: g.members.every((m) => m.read), triage },
      repeat: g.repeat,
      firstAt: g.members.reduce((min, m) => (m.ranAt < min ? m.ranAt : min), g.rep.ranAt),
      memberIds: g.members.map((m) => m.id),
      from,
    };
  });
  return { rows, hiddenTaskUpdates };
}
