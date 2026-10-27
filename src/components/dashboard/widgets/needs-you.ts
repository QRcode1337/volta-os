'use client';
// "Needs you": one merged view of what waits on the user across Systems (attention items), Tasks ([@] awaiting
// in actions.md) and Feeds (unread needs-action job outputs). Read-only; every row deep-links into its app.
// All three reads go through the shared-json store with the same URL keys as their other readers, so nothing is
// fetched twice: /api/systems?summary=1 is SystemsBadge's (and the phone tab dot's), /api/actions is the phone
// AwaitingCard's. The full /api/actions payload (not ?counts=1) is used so the oldest awaiting title can be shown.

import { useMemo } from 'react';
import type { SystemsSummary } from '@/types/systems';
import type { FeedListResponse } from '@/lib/server/feeds/types';
import type { ActionsResponse } from '@/components/tasks/types';
import { cleanActionText } from '@/components/mobile/home/data';
import { BADGE_POLL_MS, SYSTEMS_SUMMARY_URL } from '@/components/systems/SystemsBadge';
import { errorText } from './right-hooks';
import { useSharedJson, type SharedJson } from './shared-json';

const ACTIONS_URL = '/api/actions';
const ACTIONS_POLL_MS = 60_000; // same cadence as AwaitingBadge / AwaitingCard
// Unread needs-action only (what the Feeds source list badges), newest first; 3 items is enough for a title.
const FEEDS_URL = '/api/feeds?needsAction=1&unread=1&limit=3';
const FEEDS_POLL_MS = 120_000;

export type NeedsYouId = 'systems' | 'tasks' | 'feeds';
/** critical = red · warn = amber · hot = orange (waiting on you) · clear = nothing to do · unknown = not loaded / failed. */
export type NeedsYouTone = 'critical' | 'warn' | 'hot' | 'clear' | 'unknown';

export interface NeedsYouRow {
  id: NeedsYouId;
  label: string;
  href: string;
  /** null while loading or when the source failed with nothing cached. */
  count: number | null;
  tone: NeedsYouTone;
  /** One line under the label: the most pressing item, "Nothing waiting", or the failure. */
  detail: string;
  /** Hover text (desktop): the full list where cheap. */
  tip: string;
  loading: boolean;
  /** Failed with nothing cached (a failed refresh over good data keeps the data and sets `stale`). */
  failed: boolean;
  stale: boolean;
}

export interface NeedsYou {
  rows: NeedsYouRow[];
  /** Sum of the counts that are known. */
  total: number;
  /** Worst tone among the rows (critical > warn > hot > clear > unknown). */
  tone: NeedsYouTone;
  /** No source has answered yet. */
  loading: boolean;
  /** Every source answered and none has anything waiting. */
  allClear: boolean;
  /** Every source failed with nothing cached. */
  allFailed: boolean;
  refreshing: boolean;
  reload: () => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function base<T>(q: SharedJson<T>) {
  return { loading: !q.data && (q.loading || !q.error), failed: !q.data && !!q.error && !q.loading, stale: !!q.data && !!q.error };
}

function systemsRow(q: SharedJson<SystemsSummary>): NeedsYouRow {
  const s = base(q);
  const row = { id: 'systems' as const, label: 'Systems', href: '/apps/systems', ...s };
  if (!q.data) {
    const msg = s.failed ? `Unavailable · ${errorText(q.error)}` : 'Checking…';
    return { ...row, count: null, tone: 'unknown', detail: msg, tip: msg };
  }
  // Critical first so the headline is the worst problem.
  const items = [...q.data.attention].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));
  const crit = items.filter((a) => a.severity === 'critical').length;
  return {
    ...row,
    count: items.length,
    tone: crit ? 'critical' : items.length ? 'warn' : 'clear',
    detail: items[0]?.title ?? `${q.data.counts.up}/${q.data.services} services up`,
    tip: items.length
      ? items.map((a) => `${a.severity === 'critical' ? '●' : '○'} ${a.title}`).join('\n')
      : `${q.data.counts.up}/${q.data.services} services up · nothing needs attention`,
  };
}

function tasksRow(q: SharedJson<ActionsResponse>): NeedsYouRow {
  const s = base(q);
  const row = { id: 'tasks' as const, label: 'Tasks', href: '/apps/tasks', ...s };
  if (!q.data || q.data.available === false) {
    const msg = q.data ? `Unavailable · ${q.data.reason ?? 'actions.md could not be read'}` : s.failed ? `Unavailable · ${errorText(q.error)}` : 'Reading actions.md…';
    return { ...row, failed: !!q.data || s.failed, loading: !q.data && s.loading, count: null, tone: 'unknown', detail: msg, tip: msg };
  }
  const n = q.data.counts?.byStatus?.awaiting ?? 0;
  // Oldest first, the same order as the phone AwaitingCard.
  const items = (q.data.items ?? [])
    .filter((i) => i.status === 'awaiting')
    .sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1))
    .map((i) => `${cleanActionText(i.text)}${i.ageDays !== null ? ` (${i.ageDays}d)` : ''}`);
  return {
    ...row,
    count: n,
    tone: n ? 'hot' : 'clear',
    detail: items[0] ?? 'Nothing waiting on you',
    tip: n ? [`${plural(n, 'item')} waiting on you, oldest first:`, ...items.slice(0, 5)].join('\n') : 'Nothing in the action pipeline waits on you',
  };
}

function feedsRow(q: SharedJson<FeedListResponse>): NeedsYouRow {
  const s = base(q);
  const row = { id: 'feeds' as const, label: 'Feeds', href: '/apps/feeds', ...s };
  if (!q.data) {
    const msg = s.failed ? `Unavailable · ${errorText(q.error)}` : 'Reading job outputs…';
    return { ...row, count: null, tone: 'unknown', detail: msg, tip: msg };
  }
  const n = q.data.totals.needsAction;
  const top = q.data.items.map((i) => `${i.sourceLabel}: ${i.title}`);
  return {
    ...row,
    count: n,
    tone: n ? 'warn' : 'clear',
    detail: top[0] ?? 'No unread items need action',
    tip: n ? [`${plural(n, 'unread item')} need action, newest first:`, ...top].join('\n') : 'No unread job outputs need action',
  };
}

const RANK: Record<NeedsYouTone, number> = { critical: 4, warn: 3, hot: 2, clear: 1, unknown: 0 };

export function useNeedsYou(): NeedsYou {
  const systems = useSharedJson<SystemsSummary>(SYSTEMS_SUMMARY_URL, BADGE_POLL_MS);
  const tasks = useSharedJson<ActionsResponse>(ACTIONS_URL, ACTIONS_POLL_MS);
  const feeds = useSharedJson<FeedListResponse>(FEEDS_URL, FEEDS_POLL_MS);

  const rows = useMemo(() => [systemsRow(systems), tasksRow(tasks), feedsRow(feeds)], [systems, tasks, feeds]);
  const reload = () => {
    void systems.reload();
    void tasks.reload();
    void feeds.reload();
  };

  const total = rows.reduce((sum, r) => sum + (r.count ?? 0), 0);
  const tone = rows.reduce<NeedsYouTone>((worst, r) => (RANK[r.tone] > RANK[worst] ? r.tone : worst), 'unknown');
  return {
    rows,
    total,
    tone,
    loading: rows.every((r) => r.loading),
    allClear: rows.every((r) => r.count === 0),
    allFailed: rows.every((r) => r.failed),
    refreshing: systems.refreshing || tasks.refreshing || feeds.refreshing,
    reload,
  };
}

/** Text colour per tone (shared by the phone card and the desktop panel). */
export const TONE_TEXT: Record<NeedsYouTone, string> = {
  critical: 'text-[#EF4444]',
  warn: 'text-amber',
  hot: 'text-orange',
  clear: 'text-green',
  unknown: 'text-muted',
};

/** Dot colour per tone; critical pulses. */
export const TONE_DOT: Record<NeedsYouTone, string> = {
  critical: 'animate-pulse bg-[#EF4444]',
  warn: 'bg-amber',
  hot: 'bg-orange',
  clear: 'bg-green',
  unknown: 'bg-highlight',
};
