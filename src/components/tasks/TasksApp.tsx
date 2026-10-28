'use client';
// VOLTA Tasks: live board over the OpenClaw action pipeline (~/.openclaw/wiki/main/actions.md).
// GET /api/actions parses the file; the drawer's status moves and notes POST to /api/actions, which edits the item
// inline (backup kept). Polls every 60 s while the tab is visible.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Copy, RefreshCw, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AppTopBar } from '@/components/elements/kit/AppTopBar';
import { ToastStack, useToasts } from '@/components/elements/kit/toast';
import { copyText } from '@/components/elements/kit/clipboard';
import { NoteViewer, SOURCE_NOTE, STATUS_STYLE, TaskColumn, TaskDetail, type TaskActions, type TaskAgentResult } from './TaskParts';
import { useRemoteClient } from '@/lib/remote-client';
import { ACTION_STATUSES, DEFAULT_STALE_DAYS, isStale, type ActionItem, type ActionStatus, type ActionsResponse } from './types';

const POLL_MS = 60_000;
const REFETCH_ON_FOCUS_MS = 15_000;
const STALE_KEY = 'volta:tasks:staleDays';
const STALE_CHOICES = [7, 14, 21, 30, 60];

function readStaleDays(): number {
  try {
    const n = Number(window.localStorage.getItem(STALE_KEY));
    return STALE_CHOICES.includes(n) ? n : DEFAULT_STALE_DAYS;
  } catch {
    return DEFAULT_STALE_DAYS;
  }
}

async function fetchActions(signal: AbortSignal, refresh: boolean): Promise<ActionsResponse> {
  const res = await fetch(`/api/actions${refresh ? '?refresh=1' : ''}`, { cache: 'no-store', signal });
  const body = (await res.json().catch(() => ({}))) as ActionsResponse & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

const selectCls =
  'h-8 rounded-full border border-subtle bg-panel-elevated px-3 font-mono text-[11px] text-secondary outline-none hover:border-highlight focus:border-orange';

function sortItems(a: ActionItem, b: ActionItem): number {
  if (a.status === 'done' && b.status === 'done') return (b.updated ?? '').localeCompare(a.updated ?? '') || a.line - b.line;
  return (b.ageDays ?? -1) - (a.ageDays ?? -1) || a.line - b.line; // oldest first
}

export function TasksApp() {
  const { toasts, push, dismiss } = useToasts();
  const [data, setData] = useState<ActionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [agent, setAgent] = useState('all');
  const [section, setSection] = useState('all');
  const [staleDays, setStaleDays] = useState(DEFAULT_STALE_DAYS);
  const [staleOnly, setStaleOnly] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lastFetch = useRef(0);
  const inflight = useRef<AbortController | null>(null);

  useEffect(() => setStaleDays(readStaleDays()), []);

  const load = useCallback(async (refresh = false) => {
    if (inflight.current) {
      if (!refresh) return;
      inflight.current.abort();
    }
    const ctl = new AbortController();
    inflight.current = ctl;
    setRefreshing(true);
    try {
      const d = await fetchActions(ctl.signal, refresh);
      setData(d);
      setError(null);
      lastFetch.current = Date.now();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      if (inflight.current === ctl) {
        inflight.current = null;
        setRefreshing(false);
      }
    }
  }, []);

  // Initial load + 60 s poll, paused while the tab is hidden; catches up when it becomes visible again.
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch.current > REFETCH_ON_FOCUS_MS) void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      inflight.current?.abort();
    };
  }, [load]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const agents = useMemo(() => [...new Set(items.map((i) => i.agent))].sort(), [items]);
  const sections = useMemo(() => [...new Set(items.map((i) => i.section || '(none)'))], [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (agent !== 'all' && i.agent !== agent) return false;
      if (section !== 'all' && (i.section || '(none)') !== section) return false;
      if (staleOnly && !isStale(i, staleDays)) return false;
      if (q && !`${i.text} ${i.notes.join(' ')} ${i.agent} ${i.section}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, agent, section, staleOnly, staleDays]);

  const byStatus = useMemo(() => {
    const all = {} as Record<ActionStatus, ActionItem[]>;
    const shown = {} as Record<ActionStatus, ActionItem[]>;
    for (const s of ACTION_STATUSES) {
      all[s] = items.filter((i) => i.status === s);
      shown[s] = filtered.filter((i) => i.status === s).sort(sortItems);
    }
    return { all, shown };
  }, [items, filtered]);

  const staleCount = useMemo(() => items.filter((i) => isStale(i, staleDays)).length, [items, staleDays]);
  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);
  const filtering = query !== '' || agent !== 'all' || section !== 'all' || staleOnly;

  const remote = useRemoteClient();
  const [notePath, setNotePath] = useState<string | null>(null);
  const closeNote = useCallback(() => setNotePath(null), []);

  // Acting on an item: the server re-finds it by id in actions.md and edits it inline (see actions-write.ts).
  const [busy, setBusy] = useState<string | null>(null);
  const [agentResult, setAgentResult] = useState<TaskAgentResult | null>(null);
  const post = useCallback(
    async <T,>(key: string, body: object): Promise<T | null> => {
      setBusy(key);
      try {
        const res = await fetch('/api/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        const json = (await res.json()) as T & { error?: string };
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        return json;
      } catch (err) {
        push((err as Error).message, { tone: 'error', ttl: 7_000 });
        return null;
      } finally {
        setBusy(null);
      }
    },
    [push],
  );
  const act: TaskActions = {
    busy,
    agent: agentResult,
    onStatus: async (item, status) => {
      if (!(await post(`status:${status}`, { action: 'status', id: item.id, line: item.line, status }))) return;
      push(`Moved to ${STATUS_STYLE[status].label}`, { tone: 'success' });
      void load(true);
    },
    onNote: async (item, note) => {
      if (!(await post('note', { action: 'note', id: item.id, line: item.line, note }))) return false;
      push('Note saved under the item', { tone: 'success' });
      void load(true);
      return true;
    },
    onAgent: async (item, onMac) => {
      const r = await post<Omit<TaskAgentResult, 'id'>>('agent', { action: 'agent', id: item.id, line: item.line, open: onMac });
      if (!r) return;
      setAgentResult({ id: item.id, ...r });
      if (onMac) push(r.opened ? 'Claude Code opened in Terminal on the Mac' : `Couldn’t open Terminal: ${r.error}`, { tone: r.opened ? 'success' : 'error' });
    },
  };

  const onCopy = useCallback(
    async (text: string, what: string) => {
      const ok = await copyText(text);
      push(ok ? what : 'Copy failed; select the command and copy it manually.', { tone: ok ? 'success' : 'error' });
    },
    [push],
  );
  const changeStale = (n: number) => {
    setStaleDays(n);
    try {
      window.localStorage.setItem(STALE_KEY, String(n));
    } catch {
      // storage unavailable: threshold just resets next visit
    }
  };

  // Column widths: filled columns share the row, empty ones shrink, Done stays a slim strip until opened.
  const cols = ACTION_STATUSES.map((s) => {
    if (s === 'done') return doneOpen ? 'minmax(0,1.2fr)' : 'minmax(0,0.5fr)';
    if (s === 'awaiting') return 'minmax(0,1.6fr)';
    return byStatus.all[s].length === 0 ? 'minmax(0,0.5fr)' : 'minmax(0,1fr)';
  }).join(' ');

  const source = data?.source;
  const mtime = source?.mtime ? new Date(source.mtime).toLocaleString() : null;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-paper">
      <AppTopBar
        accent="Tasks"
        subtitle="Agent action pipeline · OpenClaw"
        right={
          <>
            {mtime && (
              <span className="hud-label hidden md:inline" title={`${source?.path ?? 'actions.md'} · status moves and notes edit it inline; a backup is kept`}>
                actions.md · updated {mtime}
              </span>
            )}
            <button
              type="button"
              onClick={() => void load(true)}
              aria-label="Refresh"
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-subtle px-3 font-mono text-[10px] uppercase tracking-[0.06em] text-muted hover:text-paper"
            >
              <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} /> Refresh
            </button>
          </>
        }
      />

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-subtle px-4 py-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks and notes"
            aria-label="Search tasks"
            className="h-8 w-64 rounded-full border border-subtle bg-panel-elevated pl-8 pr-8 text-[12px] text-paper outline-none placeholder:text-muted focus:border-orange"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-paper">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        <select value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Filter by agent" className={selectCls}>
          <option value="all">All agents</option>
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select value={section} onChange={(e) => setSection(e.target.value)} aria-label="Filter by section" className={selectCls}>
          <option value="all">All sections</option>
          {sections.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setStaleOnly((v) => !v)}
            aria-pressed={staleOnly}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors',
              staleOnly ? 'border-amber bg-amber/10 text-paper' : 'border-transparent text-secondary hover:border-subtle hover:text-paper',
            )}
          >
            <AlertTriangle className="h-3 w-3 text-amber" /> Stale
            <span className="rounded-full bg-panel-elevated px-1.5 font-mono text-[10px] text-muted">{staleCount}</span>
          </button>
          <select value={staleDays} onChange={(e) => changeStale(Number(e.target.value))} aria-label="Stale after N days" className={selectCls}>
            {STALE_CHOICES.map((n) => (
              <option key={n} value={n}>
                after {n}d
              </option>
            ))}
          </select>
        </div>
        {filtering && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setAgent('all');
              setSection('all');
              setStaleOnly(false);
            }}
            className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted hover:text-paper"
          >
            Clear filters ({filtered.length}/{items.length})
          </button>
        )}
        {source && remote && (
          <button
            type="button"
            onClick={() => setNotePath(SOURCE_NOTE)}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-full border border-subtle px-3 font-mono text-[10.5px] text-muted hover:border-highlight hover:text-paper"
          >
            View actions.md
          </button>
        )}
        {source && !remote && (
          <button
            type="button"
            onClick={() => void onCopy(source.openHint, 'Command copied.')}
            className="ml-auto inline-flex h-8 items-center gap-2 rounded-full border border-subtle px-3 font-mono text-[10.5px] text-muted hover:border-highlight hover:text-paper"
            title="Copy"
          >
            <span className="text-orange">$</span> {source.openHint} <Copy className="h-3 w-3" />
          </button>
        )}
      </div>

      {error && (
        <p className="mx-4 mt-3 shrink-0 rounded-md border border-[#EF4444]/40 bg-[#EF4444]/5 px-3 py-2 font-mono text-[11px] text-[#EF4444]">
          Could not load /api/actions: {error}
          {data ? ' (showing the last good data)' : ''}
        </p>
      )}
      {data && !data.available && (
        <p className="mx-4 mt-3 flex shrink-0 items-start gap-2 rounded-md border border-amber/40 bg-amber/5 px-3 py-2 text-[12.5px]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
          <span>{data.reason ?? 'actions.md is unavailable.'}</span>
        </p>
      )}

      <main className="hud-scroll min-h-0 flex-1 overflow-y-auto p-4">
        {!data && !error ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Loading actions...</p>
        ) : data ? (
          <div className="grid grid-cols-1 gap-3 lg:h-full lg:[grid-template-columns:var(--cols)]" style={{ '--cols': cols } as React.CSSProperties}>
            {ACTION_STATUSES.map((s) => (
              <TaskColumn
                key={s}
                status={s}
                items={byStatus.shown[s]}
                total={byStatus.all[s].length}
                staleDays={staleDays}
                selectedId={selectedId}
                onOpen={setSelectedId}
                collapsed={s === 'done' ? !doneOpen : undefined}
                onToggle={s === 'done' ? () => setDoneOpen((v) => !v) : undefined}
              />
            ))}
          </div>
        ) : null}
      </main>

      {selected && source && (
        <TaskDetail item={selected} source={source} staleDays={staleDays} onClose={() => setSelectedId(null)} onCopy={(t, w) => void onCopy(t, w)} onOpenNote={setNotePath} remote={remote} act={act} />
      )}
      {notePath && <NoteViewer rel={notePath} onClose={closeNote} onCopy={(t, w) => void onCopy(t, w)} remote={remote} />}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

export default TasksApp;
