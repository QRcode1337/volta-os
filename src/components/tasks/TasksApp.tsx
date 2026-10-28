'use client';
// VOLTA Tasks: live board over the OpenClaw action pipeline (~/.openclaw/wiki/main/actions.md).
// GET /api/actions parses the file; the drawer's status moves and notes POST to /api/actions, which edits the item
// inline (backup kept). Polls every 60 s while the tab is visible.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Copy, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
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
// Phone sheet controls: 40px targets, 16px text so iOS doesn't zoom on focus.
const sheetSelectCls =
  'h-10 w-full rounded-full border border-subtle bg-panel-elevated px-3 font-mono text-[16px] text-secondary outline-none focus:border-orange';

/** Status-bar chip labels where the column title is too long for a phone chip. */
const CHIP_LABEL: Partial<Record<ActionStatus, string>> = { awaiting: 'Awaiting' };

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/*
 * Phone-only (< md) bottom sheet for the filters that don't fit the one-row toolbar.
 * z-[55]: above the board and the MobileTabBar (z-50), below the task drawer (z-[60]) and note viewer (z-[65]).
 * Esc / backdrop / close button dismiss it; the first select takes focus on open.
 */
function FilterSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    ref.current?.querySelector<HTMLElement>('select, input, button:not([data-sheet-close])')?.focus({ preventScroll: true });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[55] md:hidden">
      <div
        aria-hidden
        onClick={onClose}
        className={cn('absolute inset-0 bg-black/70 transition-opacity duration-200 motion-reduce:transition-none', entered ? 'opacity-100' : 'opacity-0')}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Task filters"
        className={cn(
          'absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-[18px] border-t border-highlight bg-panel shadow-[0_-16px_48px_rgba(0,0,0,0.65)] transition-transform duration-200 ease-out motion-reduce:transition-none',
          entered ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-highlight" />
        <header className="flex shrink-0 items-center gap-2 px-4 pt-1">
          <h2 className="hud-label">Filters</h2>
          <button
            type="button"
            data-sheet-close
            onClick={onClose}
            aria-label="Close filters"
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-panel-hover active:text-paper"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="hud-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-1">
          {children}
        </div>
      </div>
    </div>
  );
}

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
  // Badge on the phone Filters button: the filters that live in the sheet (search stays in the toolbar).
  const sheetFilters = Number(agent !== 'all') + Number(section !== 'all') + Number(staleOnly);
  const clearFilters = () => {
    setQuery('');
    setAgent('all');
    setSection('all');
    setStaleOnly(false);
  };

  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersBtn = useRef<HTMLButtonElement>(null);
  const closeFilters = useCallback(() => {
    setFiltersOpen(false);
    filtersBtn.current?.focus({ preventScroll: true });
  }, []);

  // Phone status bar: jump to a column (ids set by TaskColumn); Done opens first so there is something to land on.
  const jumpTo = (s: ActionStatus) => {
    if (s === 'done') setDoneOpen(true);
    requestAnimationFrame(() =>
      document.getElementById(`tasks-col-${s}`)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }),
    );
  };

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

  // Column widths (lg grid): filled columns share the row (Awaiting gets the most), while empty columns and the
  // collapsed Done strip become rails. The 160px floor fits a full rail header ("IN PROGRESS 0", "DONE 12/52 ›")
  // so nothing clips at the right edge at 1024–1440px.
  const RAIL = 'minmax(160px,0.45fr)';
  const cols = ACTION_STATUSES.map((s) => {
    if (s === 'done' && !doneOpen) return RAIL;
    if (byStatus.all[s].length === 0) return RAIL;
    if (s === 'done') return 'minmax(0,1.2fr)';
    if (s === 'awaiting') return 'minmax(0,1.6fr)';
    return 'minmax(0,1fr)';
  }).join(' ');

  // Options shared by the desktop toolbar selects and the phone filter sheet.
  const agentOptions = (
    <>
      <option value="all">All agents</option>
      {agents.map((a) => (
        <option key={a} value={a}>
          {a}
        </option>
      ))}
    </>
  );
  const sectionOptions = (
    <>
      <option value="all">All sections</option>
      {sections.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </>
  );
  const staleOptions = STALE_CHOICES.map((n) => (
    <option key={n} value={n}>
      after {n}d
    </option>
  ));

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
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-subtle px-3 font-mono text-[11px] uppercase tracking-[0.06em] text-muted hover:text-paper"
            >
              <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} /> Refresh
            </button>
          </>
        }
      />

      {/* Toolbar. md+: every filter inline (unchanged). Phone: search + a Filters button that opens FilterSheet. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-subtle px-4 py-2 max-md:flex-nowrap max-md:py-1.5">
        <label className="relative max-md:min-w-0 max-md:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks and notes"
            aria-label="Search tasks"
            className="h-8 w-64 rounded-full border border-subtle bg-panel-elevated pl-8 pr-8 text-[12px] text-paper outline-none placeholder:text-muted focus:border-orange max-md:h-9 max-md:w-full max-md:text-[16px]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-paper max-md:right-1.5 max-md:p-1.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        <button
          ref={filtersBtn}
          type="button"
          onClick={() => setFiltersOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={filtersOpen}
          aria-label={sheetFilters ? `Filters, ${sheetFilters} active` : 'Filters'}
          className={cn(
            'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border bg-panel-elevated px-3 text-[12px] font-medium md:hidden',
            sheetFilters ? 'border-orange/60 text-paper' : 'border-subtle text-secondary',
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
          {sheetFilters > 0 && <span className="rounded-full bg-orange px-1.5 font-mono text-[11px] font-semibold leading-4 text-obsidian">{sheetFilters}</span>}
        </button>
        <div className="hidden md:contents">
          <select value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Filter by agent" className={selectCls}>
            {agentOptions}
          </select>
          <select value={section} onChange={(e) => setSection(e.target.value)} aria-label="Filter by section" className={selectCls}>
            {sectionOptions}
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
              <span className="rounded-full bg-panel-elevated px-1.5 font-mono text-[11px] text-muted">{staleCount}</span>
            </button>
            <select value={staleDays} onChange={(e) => changeStale(Number(e.target.value))} aria-label="Stale after N days" className={selectCls}>
              {staleOptions}
            </select>
          </div>
          {filtering && (
            <button type="button" onClick={clearFilters} className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted hover:text-paper">
              Clear filters ({filtered.length}/{items.length})
            </button>
          )}
          {source && remote && (
            <button
              type="button"
              onClick={() => setNotePath(SOURCE_NOTE)}
              className="ml-auto inline-flex h-9 items-center gap-2 rounded-full border border-subtle px-3 font-mono text-[11px] text-muted hover:border-highlight hover:text-paper"
            >
              View actions.md
            </button>
          )}
          {source && !remote && (
            <button
              type="button"
              onClick={() => void onCopy(source.openHint, 'Command copied.')}
              className="ml-auto inline-flex h-8 items-center gap-2 rounded-full border border-subtle px-3 font-mono text-[11px] text-muted hover:border-highlight hover:text-paper"
              title="Copy"
            >
              <span className="text-orange">$</span> {source.openHint} <Copy className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {filtersOpen && (
        <FilterSheet onClose={closeFilters}>
          <label className="flex flex-col gap-1.5">
            <span className="hud-label">Agent</span>
            <select value={agent} onChange={(e) => setAgent(e.target.value)} className={sheetSelectCls}>
              {agentOptions}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="hud-label">Section</span>
            <select value={section} onChange={(e) => setSection(e.target.value)} className={sheetSelectCls}>
              {sectionOptions}
            </select>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="hud-label">Stale</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStaleOnly((v) => !v)}
                aria-pressed={staleOnly}
                className={cn(
                  'flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border px-3 text-[13px] font-medium',
                  staleOnly ? 'border-amber bg-amber/10 text-paper' : 'border-subtle text-secondary',
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber" /> Stale only
                <span className="rounded-full bg-panel-elevated px-1.5 font-mono text-[11px] text-muted">{staleCount}</span>
              </button>
              <select value={staleDays} onChange={(e) => changeStale(Number(e.target.value))} aria-label="Stale after N days" className={cn(sheetSelectCls, 'w-auto')}>
                {staleOptions}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={clearFilters}
              disabled={!filtering}
              className="h-10 flex-1 rounded-full border border-subtle font-mono text-[11px] uppercase tracking-[0.06em] text-secondary disabled:opacity-40"
            >
              Clear filters
            </button>
            <button type="button" onClick={closeFilters} className="h-10 flex-1 rounded-full bg-orange font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-obsidian">
              Show {filtered.length}/{items.length}
            </button>
          </div>
          {source && remote && (
            <button
              type="button"
              onClick={() => {
                closeFilters();
                setNotePath(SOURCE_NOTE);
              }}
              className="inline-flex h-10 items-center justify-center rounded-full border border-subtle px-3 font-mono text-[12px] text-muted"
            >
              View actions.md
            </button>
          )}
          {source && !remote && (
            <button
              type="button"
              onClick={() => void onCopy(source.openHint, 'Command copied.')}
              className="inline-flex h-10 min-w-0 items-center gap-2 rounded-full border border-subtle px-4 font-mono text-[12px] text-muted"
              title="Copy"
            >
              <span className="text-orange">$</span>
              <span className="min-w-0 truncate">{source.openHint}</span>
              <Copy className="ml-auto h-3.5 w-3.5 shrink-0" />
            </button>
          )}
        </FilterSheet>
      )}

      {error && (
        <p className="mx-4 mt-3 shrink-0 rounded-md border border-[#EF4444]/40 bg-[#EF4444]/5 px-3 py-2 font-mono text-[11px] text-[#EF4444]">
          Could not load /api/actions: {error}
          {data ? ' (showing the last good data)' : ''}
        </p>
      )}
      {data && !data.available && (
        <p className="mx-4 mt-3 flex shrink-0 items-start gap-2 rounded-md border border-amber/40 bg-amber/5 px-3 py-2 text-[13px]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
          <span>{data.reason ?? 'actions.md is unavailable.'}</span>
        </p>
      )}

      <main className="hud-scroll min-h-0 flex-1 overflow-y-auto p-4">
        {!data && !error ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Loading actions...</p>
        ) : data ? (
          <>
            {/* Phone: sticky jump bar over the stacked columns (bleeds through main's padding). Columns carry scroll-mt-14. */}
            <nav
              aria-label="Jump to column"
              className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 flex gap-2 overflow-x-auto border-b border-subtle bg-obsidian/95 px-4 py-1.5 backdrop-blur [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden"
            >
              {ACTION_STATUSES.map((s) => {
                const st = STATUS_STYLE[s];
                const shown = byStatus.shown[s].length;
                const total = byStatus.all[s].length;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => jumpTo(s)}
                    className={cn(
                      'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border bg-panel-elevated px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-secondary active:bg-panel-hover',
                      s === 'awaiting' && total > 0 ? 'border-orange/50' : 'border-subtle',
                    )}
                  >
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', st.dot)} />
                    {CHIP_LABEL[s] ?? st.label}
                    <span className="font-normal text-muted">{shown === total ? total : `${shown}/${total}`}</span>
                  </button>
                );
              })}
            </nav>
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
          </>
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
