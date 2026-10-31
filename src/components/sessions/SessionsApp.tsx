'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, RefreshCw, Search, X } from 'lucide-react';
import type { ClaudeSessionDetail, ClaudeSessionList, ClaudeSessionSummary } from '@/types/sessions';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { isTypingTarget } from '@/lib/events';
import { AppTopBar } from '@/components/elements/kit/AppTopBar';
import { ToastStack, useToasts } from '@/components/elements/kit/toast';
import { copyText } from '@/components/elements/kit/clipboard';
import { useSharedJson } from '@/components/dashboard/widgets/shared-json';
import { ApiError, getJson } from './sessions-client';
import { ProjectRail } from './ProjectRail';
import { SessionList } from './SessionList';
import { SessionDetail, type DetailTab } from './SessionDetail';

const PAGE = 100;
const DAY_FILTERS: { days: number; label: string }[] = [
  { days: 1, label: '24h' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
  { days: 0, label: 'All' },
];
const SORTS = [
  { v: 'recent', label: 'Most recent' },
  { v: 'tokens', label: 'Most tokens' },
  { v: 'longest', label: 'Longest active' },
  { v: 'tools', label: 'Most tool calls' },
] as const;
type Sort = (typeof SORTS)[number]['v'];

export function SessionsApp() {
  const { toasts, push, dismiss } = useToasts();
  const [now, setNow] = useState<number | null>(null);

  // ── Filters ──
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [project, setProject] = useState<string | null>(null);
  const [days, setDays] = useState(0);
  const [sort, setSort] = useState<Sort>('recent');
  const [showAutomated, setShowAutomated] = useState(false);

  // ── Selection ──
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>('overview');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClaudeSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [ready, setReady] = useState(false); // URL state read (after mount)

  const searchRef = useRef<HTMLInputElement>(null);

  // Read ?session= / ?project= once, after mount (hydration-safe), and tick a clock for relative times.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const s = sp.get('session');
    const p = sp.get('project');
    if (s && /^[A-Za-z0-9_-]{1,100}$/.test(s)) setSelectedId(s);
    if (p && /^[A-Za-z0-9._-]{1,255}$/.test(p)) setProject(p);
    if (sp.get('tab') === 'transcript') setTab('transcript');
    setReady(true);
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput.trim()), 250);
    return () => clearTimeout(t);
  }, [queryInput]);

  // ── List (shared, polled; fast only while the index is still building) ──
  const listUrl = useMemo(() => {
    const sp = new URLSearchParams({ limit: String(PAGE), sort });
    if (query) sp.set('q', query);
    if (project) sp.set('project', project);
    if (days) sp.set('days', String(days));
    if (showAutomated) sp.set('automated', '1');
    return `/api/claude-sessions?${sp}`;
  }, [query, project, days, sort, showAutomated]);
  const [pollMs, setPollMs] = useState(60_000);
  const list = useSharedJson<ClaudeSessionList>(listUrl, pollMs);
  // Keep showing the previous filter's results (dimmed) until the new URL's first payload lands.
  const [shown, setShown] = useState<ClaudeSessionList | null>(null);
  const [shownUrl, setShownUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!list.data) return;
    setShown(list.data);
    setShownUrl(listUrl);
    setPollMs(list.data.progress.state === 'scanning' ? 3_000 : 60_000);
  }, [list.data, listUrl]);
  useEffect(() => {
    if (list.error && !list.data) push(`Couldn't load sessions: ${list.error.message}`, { tone: 'error' });
  }, [list.error, list.data, push]);

  // Extra pages ("Load more") for the current filter; reset whenever the filter changes.
  const [more, setMore] = useState<ClaudeSessionSummary[]>([]);
  const [moreLoading, setMoreLoading] = useState(false);
  useEffect(() => setMore([]), [listUrl]);
  const loadMore = useCallback(async () => {
    if (!shown) return;
    setMoreLoading(true);
    try {
      const r = await getJson<ClaudeSessionList>(`${listUrl}&offset=${shown.sessions.length + more.length}`);
      setMore((m) => [...m, ...r.sessions]);
    } catch (err) {
      push(`Couldn't load more: ${(err as Error).message}`, { tone: 'error' });
    } finally {
      setMoreLoading(false);
    }
  }, [shown, listUrl, more.length, push]);

  const items = useMemo(() => {
    const base = shown?.sessions ?? [];
    const seen = new Set(base.map((s) => s.id));
    return [...base, ...more.filter((s) => !seen.has(s.id))];
  }, [shown, more]);
  const total = shown?.total ?? 0;
  const stale = shownUrl !== listUrl; // showing the previous filter's results while the new ones load

  // Default selection: the newest session (a deep-linked one is kept even when it's outside the list).
  useEffect(() => {
    if (!ready || selectedId || !items.length) return;
    setSelectedId(items[0].id);
  }, [ready, selectedId, items]);

  // Keep ?session= (and ?project=) in the URL without navigating.
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    if (selectedId) url.searchParams.set('session', selectedId);
    else url.searchParams.delete('session');
    if (project) url.searchParams.set('project', project);
    else url.searchParams.delete('project');
    if (tab === 'transcript') url.searchParams.set('tab', 'transcript');
    else url.searchParams.delete('tab');
    window.history.replaceState(null, '', url);
  }, [ready, selectedId, project, tab]);

  // ── Detail ──
  const loadDetail = useCallback(
    async (id: string, signal?: AbortSignal, quiet = false) => {
      if (!quiet) {
        setDetailLoading(true);
        setDetailError(null);
      }
      try {
        const d = await getJson<ClaudeSessionDetail>(`/api/claude-sessions/${encodeURIComponent(id)}`, signal);
        if (signal?.aborted) return;
        setDetail(d);
        setDetailError(null);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        if (!quiet) {
          setDetail(null);
          setDetailError(err instanceof ApiError ? err.message : 'Failed to load session');
        }
      } finally {
        if (!signal?.aborted && !quiet) setDetailLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setAgentId(null);
    if (!selectedId) {
      setDetail(null);
      return;
    }
    const ac = new AbortController();
    void loadDetail(selectedId, ac.signal);
    return () => ac.abort();
  }, [selectedId, loadDetail]);

  // A live session grows: when the list shows a newer end / size, refresh the detail quietly.
  const selSummary = items.find((s) => s.id === selectedId);
  const selRev = selSummary ? `${selSummary.end}:${selSummary.bytes}` : null;
  useEffect(() => {
    if (!selRev || !detail || detail.id !== selectedId) return;
    if (`${detail.end}:${detail.bytes}` === selRev) return;
    const ac = new AbortController();
    void loadDetail(detail.id, ac.signal, true);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a list revision change should trigger this
  }, [selRev]);

  const selIndex = items.findIndex((s) => s.id === selectedId);
  const move = useCallback(
    (delta: number) => {
      const next = items[selIndex + delta] ?? (selIndex < 0 ? items[0] : undefined);
      if (next) setSelectedId(next.id);
      else if (delta > 0 && items.length < total && !moreLoading) void loadMore();
    },
    [items, selIndex, total, moreLoading, loadMore],
  );

  const copy = useCallback(
    async (text: string, what: string) => {
      const ok = await copyText(text);
      push(ok ? `Copied ${what}` : 'Clipboard blocked', { tone: ok ? 'success' : 'error' });
    },
    [push],
  );

  // Keyboard: / search · j/k or ↓/↑ sessions · o/t tabs · Esc blur → clear search → clear project.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (document.activeElement === searchRef.current) searchRef.current?.blur();
        else if (queryInput) setQueryInput('');
        else if (agentId) setAgentId(null);
        else if (project) setProject(null);
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        move(1);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        move(-1);
      } else if (e.key === 'o') setTab('overview');
      else if (e.key === 't') setTab('transcript');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, queryInput, project, agentId]);

  const progress = shown?.progress;
  const selectedProject = shown?.projects.find((p) => p.id === project);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian">
      <AppTopBar
        accent="Sessions"
        subtitle="Claude Code transcripts · read-only"
        center={
          <label className="flex h-8 w-[min(40vw,520px)] items-center gap-2 rounded-full border border-subtle bg-panel-elevated px-3 focus-within:border-orange/60">
            <Search className="h-3.5 w-3.5 text-muted" />
            <input
              ref={searchRef}
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Search titles, prompts, projects, branches, tools, skills  ( / )"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-paper placeholder:text-muted focus:outline-none"
            />
            {queryInput && (
              <button type="button" onClick={() => setQueryInput('')} aria-label="Clear search" className="text-muted hover:text-paper">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>
        }
        right={
          <button
            type="button"
            onClick={() => {
              void list.reload();
              if (selectedId) void loadDetail(selectedId, undefined, true);
            }}
            title="Refresh"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-subtle bg-panel-elevated text-muted hover:text-paper"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', list.refreshing && 'animate-spin')} />
          </button>
        }
      />

      <div className="flex min-h-0 flex-1 max-md:flex-col max-md:overflow-y-auto">
        <ProjectRail data={shown} now={now} selected={project} onSelect={setProject} showAutomated={showAutomated} />

        <main className="flex min-w-[360px] flex-1 flex-col max-md:min-w-0 max-md:min-h-[80dvh] max-md:shrink-0">
          <div className="shrink-0 border-b border-subtle px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="mr-1 truncate text-[16px] font-bold text-paper" title={selectedProject?.path}>
                {selectedProject ? selectedProject.name : 'All projects'}
              </h1>
              <span className="font-mono text-[11px] text-secondary">
                <span className="text-orange">{shown ? formatInt(total) : '…'}</span> session{total === 1 ? '' : 's'}
                {query && <> matching “{query}”</>}
              </span>
              {(stale || (list.refreshing && !shown)) && <span className="font-mono text-[10px] text-muted">updating…</span>}
              {progress?.state === 'scanning' && (
                <span className="font-mono text-[10px] text-amber">
                  indexing {formatInt(progress.filesIndexed)}/{formatInt(progress.filesTotal)} — partial results
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="flex rounded-full border border-subtle bg-panel-elevated p-0.5">
                {DAY_FILTERS.map((f) => (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => setDays(f.days)}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em]',
                      days === f.days ? 'bg-orange text-obsidian' : 'text-muted hover:text-paper',
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="h-6 rounded-full border border-subtle bg-panel-elevated px-2 font-mono text-[10px] text-secondary focus:border-orange/60 focus:outline-none"
                aria-label="Sort sessions"
              >
                {SORTS.map((s) => (
                  <option key={s.v} value={s.v}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowAutomated((v) => !v)}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em]',
                  showAutomated ? 'border-orange/50 bg-orange/10 text-paper' : 'border-subtle text-muted hover:text-paper',
                )}
                title="Include sessions started by tools under ~/.claude* (claude-mem observer, double-shot-latte, plugin runs)"
              >
                <Bot className="h-3 w-3" /> Automated
              </button>
              {project && (
                <button
                  type="button"
                  onClick={() => setProject(null)}
                  className="flex items-center gap-1 rounded-full border border-orange/50 bg-orange/10 px-2 py-0.5 text-[10px] text-paper"
                >
                  {selectedProject?.name ?? project} <X className="h-3 w-3" />
                </button>
              )}
              <span className="ml-auto font-mono text-[10px] text-muted">/ search · j k move · o t tabs · esc</span>
            </div>
          </div>
          <div className={cn('hud-scroll min-h-0 flex-1 overflow-y-auto', stale && 'opacity-60')}>
            {!shown ? (
              <div className="flex h-full animate-pulse items-center justify-center font-mono text-[11px] text-muted">Loading sessions…</div>
            ) : items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center font-mono text-[11px] text-muted">
                {progress?.state === 'scanning' ? (
                  <span>Indexing transcripts… nothing matches yet.</span>
                ) : (
                  <>
                    <span>No sessions match these filters.</span>
                    {!showAutomated && <span className="text-[10px]">Automated sessions are hidden — toggle “Automated” to include them.</span>}
                  </>
                )}
              </div>
            ) : (
              <SessionList
                items={items}
                selectedId={selectedId}
                now={now}
                showProject={!project}
                onSelect={(id) => setSelectedId(id)}
                hasMore={items.length < total}
                onMore={() => void loadMore()}
                loadingMore={moreLoading}
              />
            )}
          </div>
        </main>

        <SessionDetail
          detail={detail && detail.id === selectedId ? detail : null}
          loading={detailLoading}
          error={detailError}
          tab={tab}
          onTab={setTab}
          agentId={agentId}
          onAgent={setAgentId}
          onCopy={copy}
        />
      </div>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
