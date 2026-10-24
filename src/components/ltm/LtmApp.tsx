'use client';
// LTM viewer (unvolta-ltm screen memory, read-only).
//
// Deep links (VOLTA Search and other widgets link here):
//   /apps/ltm?date=YYYY-MM-DD             open that day (falls back to the newest day, with a notice, if it has no captures)
//   /apps/ltm?capture=<id>                open the capture's own day, select it, scroll to it and mark it "linked";
//                                         `date` is optional — the capture's timestamp wins. If the id is gone
//                                         (pruned by ltm_prune.py, or never existed) a notice says so.
//   /apps/ltm?q=<text>                    prefill the search box and run the search (all days)
//   /apps/ltm?date=…&capture=<id>&q=<text> the capture with its matches highlighted; the search is scoped to that day
// The URL keeps `date`, `q` (while searching) and `capture` (while the linked capture is still selected).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, HardDrive, Link2, RefreshCw, Search, X } from 'lucide-react';
import type { LtmCapture, LtmCaptureList, LtmCaptureSummary, LtmDay, LtmSessionNote, LtmStatus, ObsidianVault } from '@/types/ltm';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { isTypingTarget } from '@/lib/events';
import { AppTopBar } from '@/components/elements/kit/AppTopBar';
import { ToastStack, useToasts } from '@/components/elements/kit/toast';
import { copyText } from '@/components/elements/kit/clipboard';
import { ApiError, appColor, dayLabel, getJson, hhmm, isAbortError, nowLocalIso } from './ltm-client';
import { useVisiblePoll } from './useVisiblePoll';
import { DayRail } from './DayRail';
import { DayTimeline } from './DayTimeline';
import { CaptureList } from './CaptureList';
import { CaptureInspector } from './CaptureInspector';

const DAY_PAGE = 300; // rows rendered per "load more" in day mode
const SEARCH_PAGE = 100;
const LINKED_SEARCH_MAX = 1000; // most search rows loaded at once to reach a deep-linked capture
const Q_MAX = 200; // /api/ltm/captures rejects longer queries
const OVERVIEW_POLL_MS = 60_000; // status + day list; new captures land every few minutes
const DATE_RE = /^\d{4}-\d\d-\d\d$/;

/** The capture named by ?capture= in the URL. */
type Linked =
  | { id: number; state: 'pending' }
  | { id: number; state: 'found'; date: string }
  | { id: number; state: 'missing' }
  | { id: number; state: 'error'; message: string };

export function LtmApp() {
  const { toasts, push, dismiss } = useToasts();

  // ── Global data ──
  const [status, setStatus] = useState<LtmStatus | null>(null);
  const [days, setDays] = useState<LtmDay[]>([]);
  const [vaults, setVaults] = useState<ObsidianVault[] | null>(null);
  const [nowIso, setNowIso] = useState<string | null>(null);

  // ── Navigation state ──
  const [date, setDate] = useState<string | null>(null);
  const [appFilter, setAppFilter] = useState<string | null>(null);
  const [range, setRange] = useState<{ from: number; to: number; label: string } | null>(null);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'all' | 'day'>('all');

  // ── Lists ──
  const [dayCaptures, setDayCaptures] = useState<LtmCaptureSummary[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayLimit, setDayLimit] = useState(DAY_PAGE);
  const [sessions, setSessions] = useState<LtmSessionNote[]>([]);
  /** `scope` = the day the results belong to ('all' for every day), so a day switch never shows the old day's hits. */
  const [results, setResults] = useState<LtmCaptureList & { scope: string | null }>({ items: [], total: 0, scope: null });
  const [searchLoading, setSearchLoading] = useState(false);

  // ── Deep link ──
  const [urlRead, setUrlRead] = useState(false);
  const urlDate = useRef<string | null>(null);
  const [linked, setLinked] = useState<Linked | null>(null);
  const [scrollToId, setScrollToId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ── Selection ──
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [capture, setCapture] = useState<LtmCapture | null>(null);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [tab, setTab] = useState<'capture' | 'sessions'>('capture');
  const [lightbox, setLightbox] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const searching = query.length > 0;

  // Status + day list: on mount, then every 60s while the tab is visible (paused while hidden).
  const loadOverview = useCallback(async () => {
    setNowIso(nowLocalIso());
    try {
      const s = await getJson<LtmStatus>('/api/ltm/status');
      setStatus(s);
      if (s.available) setDays((await getJson<{ days: LtmDay[] }>('/api/ltm/days')).days);
    } catch (err) {
      setStatus((prev) => prev ?? ({ available: false, reason: (err as Error).message } as LtmStatus));
    }
  }, []);
  useVisiblePoll(() => void loadOverview(), OVERVIEW_POLL_MS, 'overview');

  useEffect(() => {
    getJson<{ vaults: ObsidianVault[] }>('/api/vaults')
      .then((r) => setVaults(r.vaults))
      .catch(() => setVaults([]));
  }, []);

  // Read the deep-link params once (after mount, so SSR and the first client render match).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const d = sp.get('date');
    urlDate.current = d && DATE_RE.test(d) ? d : null;
    const raw = sp.get('capture');
    const id = raw && /^\d{1,12}$/.test(raw) ? Number(raw) : null;
    if (id != null) setLinked({ id, state: 'pending' });
    else if (raw) setNotice(`Ignored the link's capture id “${raw.slice(0, 40)}” — not a number.`);
    const q = sp.get('q')?.trim().slice(0, Q_MAX);
    if (q) {
      setQueryInput(q);
      setQuery(q);
      if (id != null) setSearchScope('day'); // the linked capture's day: its hits, with the capture among them
    }
    setUrlRead(true);
  }, []);

  // Resolve ?capture= to its day (the capture's own timestamp beats ?date=).
  const pendingLinkId = linked?.state === 'pending' ? linked.id : null;
  useEffect(() => {
    if (pendingLinkId == null) return;
    const ac = new AbortController();
    getJson<LtmCapture>(`/api/ltm/captures/${pendingLinkId}`, ac.signal)
      .then((c) => {
        if (!ac.signal.aborted) setLinked({ id: pendingLinkId, state: 'found', date: c.ts.slice(0, 10) });
      })
      .catch((err) => {
        if (ac.signal.aborted || isAbortError(err)) return;
        setLinked(
          err instanceof ApiError && err.status === 404
            ? { id: pendingLinkId, state: 'missing' }
            : { id: pendingLinkId, state: 'error', message: (err as Error).message },
        );
      });
    return () => ac.abort();
  }, [pendingLinkId]);

  // Pick the first day: the linked capture's day, else ?date=, else the newest day.
  useEffect(() => {
    if (date || !days.length || !urlRead || linked?.state === 'pending') return;
    if (linked?.state === 'found') {
      setDate(linked.date);
      setSelectedId(linked.id);
      setScrollToId(linked.id);
      return;
    }
    const want = urlDate.current;
    const has = want != null && days.some((d) => d.date === want);
    const fallback = has ? `showing ${dayLabel(want).long}` : 'showing the newest day';
    if (linked?.state === 'missing') {
      setNotice(`Capture #${linked.id} from the link isn't in the LTM database — it was pruned (ltm_prune.py) or never existed; ${fallback}.`);
    } else if (linked?.state === 'error') {
      setNotice(`Couldn't open capture #${linked.id}: ${linked.message}; ${fallback}.`);
    } else if (want && !has) {
      setNotice(`No captures on ${dayLabel(want).long}; showing the newest day.`);
    }
    setDate(has ? want : days[0].date);
  }, [days, date, urlRead, linked]);

  // Keep the URL in step (no navigation): ?date=, ?q= while searching, ?capture= while the linked capture is selected.
  useEffect(() => {
    if (!date) return;
    const url = new URL(window.location.href);
    url.searchParams.set('date', date);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    if (linked?.state === 'found' && selectedId === linked.id) url.searchParams.set('capture', String(linked.id));
    else url.searchParams.delete('capture');
    if (url.href !== window.location.href) window.history.replaceState(null, '', url);
  }, [date, query, linked, selectedId]);

  // Load the selected day's captures + vault notes. The previous day's data is dropped up
  // front so the list/timeline/inspector never show it under the new day's header.
  useEffect(() => {
    if (!date) return;
    const ac = new AbortController();
    setDayLoading(true);
    setDayLimit(DAY_PAGE);
    setRange(null);
    setDayCaptures([]);
    setSessions([]);
    Promise.all([
      getJson<LtmCaptureList>(`/api/ltm/captures?date=${date}&order=asc&limit=5000`, ac.signal),
      getJson<{ sessions: LtmSessionNote[] }>(`/api/ltm/sessions?date=${date}`, ac.signal).catch(() => ({ sessions: [] })),
    ])
      .then(([caps, ses]) => {
        if (ac.signal.aborted) return; // superseded by a newer day
        setDayCaptures(caps.items ?? []);
        setSessions(ses.sessions ?? []);
      })
      .catch((err) => {
        if (!ac.signal.aborted && !isAbortError(err)) push(`Couldn't load ${date}: ${(err as Error).message}`, { tone: 'error' });
      })
      .finally(() => {
        if (!ac.signal.aborted) setDayLoading(false); // an aborted load must not end the newer one's loading state
      });
    return () => ac.abort();
  }, [date, push]);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput.trim()), 250);
    return () => clearTimeout(t);
  }, [queryInput]);

  // Server-side search (all days or this day). Only the "this day" scope depends on the date.
  const searchDate = searchScope === 'day' ? date : null;
  const resultsScope = searchScope === 'day' ? date : 'all';
  const pinnedRef = useRef<number | null>(null); // the deep-linked capture while it is still selected (set below)
  const runSearch = useCallback(
    async (offset: number, signal?: AbortSignal) => {
      const sp = new URLSearchParams({ q: query, limit: String(SEARCH_PAGE), offset: String(offset) });
      if (searchDate) sp.set('date', searchDate);
      if (appFilter) sp.set('app', appFilter);
      const scope = searchDate ?? 'all';
      setSearchLoading(true);
      try {
        // Deep link + q: hits are newest first, so size the first page to reach the linked capture
        // (its rank = matches with id ≥ it). Capped; beyond that it stays pinned in the inspector only.
        const pinned = pinnedRef.current;
        if (!offset && pinned != null) {
          const rp = new URLSearchParams(sp);
          rp.set('from', String(pinned));
          rp.set('limit', '1');
          const rank = (await getJson<LtmCaptureList>(`/api/ltm/captures?${rp}`, signal)).total;
          if (rank > SEARCH_PAGE && rank <= LINKED_SEARCH_MAX) sp.set('limit', String(Math.ceil(rank / SEARCH_PAGE) * SEARCH_PAGE));
        }
        const r = await getJson<LtmCaptureList>(`/api/ltm/captures?${sp}`, signal);
        if (signal?.aborted) return; // superseded by a newer search
        setResults((prev) => (offset ? { items: [...prev.items, ...r.items], total: r.total, scope } : { ...r, scope }));
      } catch (err) {
        if (!signal?.aborted && !isAbortError(err)) push(`Search failed: ${(err as Error).message}`, { tone: 'error' });
      } finally {
        if (!signal?.aborted) setSearchLoading(false);
      }
    },
    [query, searchDate, appFilter, push],
  );

  const searchWaitsForDay = searchScope === 'day' && !date; // e.g. a deep link still resolving its capture's day
  useEffect(() => {
    if (!searching || searchWaitsForDay) return;
    const ac = new AbortController();
    void runSearch(0, ac.signal);
    return () => ac.abort();
  }, [searching, searchWaitsForDay, runSearch]);

  // The list on screen: search results, or the day (newest first) narrowed by app / session range.
  const dayFiltered = useMemo(() => {
    let list = dayCaptures;
    if (appFilter) list = list.filter((c) => c.app === appFilter);
    if (range) list = list.filter((c) => c.id >= range.from && c.id <= range.to);
    return [...list].reverse();
  }, [dayCaptures, appFilter, range]);

  // Search results from another day (scope "this day" after ←/→) are stale: show loading, not them.
  const searchStale = searching && results.scope !== resultsScope;
  const visible = useMemo(
    () => (searching ? (searchStale ? [] : results.items) : dayFiltered.slice(0, dayLimit)),
    [searching, searchStale, results.items, dayFiltered, dayLimit],
  );
  const visibleTotal = searching ? results.total : dayFiltered.length;

  // The deep-linked capture stays selected on its day — even when the list (e.g. search hits) doesn't
  // contain it — until the user picks another capture or another day.
  const linkedId = linked?.state === 'found' ? linked.id : null;
  const linkedDate = linked?.state === 'found' ? linked.date : null;
  const pinnedId = linkedId != null && date === linkedDate && selectedId === linkedId ? linkedId : null;
  pinnedRef.current = pinnedId;

  // Keep a valid selection. While a new day (or a day-scoped search) is still loading, drop the
  // previous selection so the inspector doesn't keep showing the old day's capture.
  const dayPending = !searching && dayLoading;
  const booting = !date && (!status || status.total > 0); // first day (or a deep link) not resolved yet
  const listPending = booting || dayPending || searchStale;
  useEffect(() => {
    if (pinnedId != null) return;
    if (!visible.length) {
      if (listPending && selectedId != null) setSelectedId(null);
      return;
    }
    if (selectedId == null || !visible.some((c) => c.id === selectedId)) setSelectedId(visible[0].id);
  }, [visible, selectedId, listPending, pinnedId]);

  // Deep link: render enough day rows to include the linked capture, then let the list scroll to it.
  useEffect(() => {
    if (scrollToId != null && selectedId !== scrollToId) setScrollToId(null); // the user moved on
  }, [scrollToId, selectedId]);
  useEffect(() => {
    if (searching || scrollToId == null) return;
    const idx = dayFiltered.findIndex((c) => c.id === scrollToId);
    if (idx >= dayLimit) setDayLimit(Math.ceil((idx + 1) / DAY_PAGE) * DAY_PAGE);
  }, [searching, scrollToId, dayFiltered, dayLimit]);
  const onScrolled = useCallback(() => setScrollToId(null), []);
  const linkedInList = linkedId != null && visible.some((c) => c.id === linkedId);

  // Load the selected capture's full text.
  useEffect(() => {
    if (selectedId == null) {
      setCapture(null);
      setCaptureError(null);
      setCaptureLoading(false);
      return;
    }
    const ac = new AbortController();
    setCaptureLoading(true);
    setCaptureError(null);
    getJson<LtmCapture>(`/api/ltm/captures/${selectedId}`, ac.signal)
      .then((c) => {
        if (!ac.signal.aborted) setCapture(c);
      })
      .catch((err) => {
        if (ac.signal.aborted || isAbortError(err)) return;
        setCapture(null);
        setCaptureError(err instanceof ApiError ? err.message : 'Failed to load capture');
      })
      .finally(() => {
        if (!ac.signal.aborted) setCaptureLoading(false);
      });
    return () => ac.abort();
  }, [selectedId]);

  const selIndex = visible.findIndex((c) => c.id === selectedId);
  const move = useCallback(
    (delta: number) => {
      const next = visible[selIndex + delta];
      if (next) setSelectedId(next.id);
      else if (delta > 0 && !searching && dayLimit < dayFiltered.length) setDayLimit((l) => l + DAY_PAGE);
    },
    [visible, selIndex, searching, dayLimit, dayFiltered.length],
  );

  const stepDay = useCallback(
    (delta: number) => {
      const i = days.findIndex((d) => d.date === date);
      const next = days[i - delta]; // days are newest-first
      if (next) {
        setDate(next.date);
        setAppFilter(null);
      }
    },
    [days, date],
  );

  const openSession = useCallback(
    (s: LtmSessionNote) => {
      if (s.captureFrom == null || s.captureTo == null) return;
      setQueryInput('');
      setQuery('');
      if (s.date !== date) setDate(s.date);
      setRange({ from: s.captureFrom, to: s.captureTo, label: s.title });
      setSelectedId(s.captureFrom);
      setTab('capture');
    },
    [date],
  );

  const copy = useCallback(
    async (text: string, what: string) => {
      const ok = await copyText(text);
      push(ok ? `Copied ${what}` : 'Clipboard blocked', { tone: ok ? 'success' : 'error' });
    },
    [push],
  );

  // Keyboard: / search · j/k or ↓/↑ captures · ←/→ days · f screenshot · Esc clear.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (lightbox) setLightbox(false);
        else if (document.activeElement === searchRef.current) searchRef.current?.blur();
        else if (queryInput) setQueryInput('');
        else if (range) setRange(null);
        else if (appFilter) setAppFilter(null);
        else if (notice) setNotice(null);
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
      } else if (e.key === 'ArrowLeft') {
        stepDay(-1);
      } else if (e.key === 'ArrowRight') {
        stepDay(1);
      } else if (e.key === 'f' && capture?.hasFrame) {
        setLightbox((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, stepDay, lightbox, queryInput, range, appFilter, capture, notice]);

  const day = days.find((d) => d.date === date);
  const dayApps = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of dayCaptures) m.set(c.app, (m.get(c.app) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [dayCaptures]);

  if (status && !status.available) {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian">
        <AppTopBar accent="LTM" subtitle="unvolta screen memory · read-only" />
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="hud-card max-w-md p-6 text-center">
            <HardDrive className="mx-auto h-8 w-8 text-amber" />
            <h2 className="mt-3 text-lg font-semibold text-paper">LTM database unavailable</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-secondary">{status.reason}</p>
            <p className="mt-3 font-mono text-[11px] text-muted">{status.dbPath}</p>
            <p className="mt-3 text-[12px] text-secondary">Mount the Windsor drive (or set LTM_DB_PATH), then retry.</p>
            <button
              type="button"
              onClick={() => void loadOverview()}
              className="mt-4 rounded-full bg-orange px-4 py-1.5 font-mono text-[11px] font-semibold uppercase text-obsidian"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian">
      <AppTopBar
        accent="LTM"
        subtitle="unvolta screen memory · read-only"
        center={
          <div className="flex items-center gap-2">
            <label className="flex h-8 w-[min(42vw,520px)] items-center gap-2 rounded-full border border-subtle bg-panel-elevated px-3 focus-within:border-orange/60">
              <Search className="h-3.5 w-3.5 text-muted" />
              <input
                ref={searchRef}
                value={queryInput}
                maxLength={Q_MAX}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder={`Search ${status ? formatInt(status.total) : ''} captures — screen text & window titles  ( / )`}
                className="min-w-0 flex-1 bg-transparent text-[12px] text-paper placeholder:text-muted focus:outline-none"
              />
              {queryInput && (
                <button type="button" onClick={() => setQueryInput('')} aria-label="Clear search" className="text-muted hover:text-paper">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>
            {searching && (
              <div className="flex rounded-full border border-subtle bg-panel-elevated p-0.5">
                {(['all', 'day'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSearchScope(s)}
                    className={cn(
                      'rounded-full px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em]',
                      searchScope === s ? 'bg-orange text-obsidian' : 'text-muted hover:text-paper',
                    )}
                  >
                    {s === 'all' ? 'All days' : 'This day'}
                  </button>
                ))}
              </div>
            )}
          </div>
        }
        right={
          <button
            type="button"
            onClick={() => void loadOverview()}
            title="Refresh"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-subtle bg-panel-elevated text-muted hover:text-paper"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        }
      />

      <div className="flex min-h-0 flex-1">
        <DayRail
          status={status}
          nowIso={nowIso}
          days={days}
          selected={date}
          onSelect={(d) => {
            setDate(d);
            setAppFilter(null);
          }}
          vaults={vaults}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          {/* Day header + timeline */}
          <div className="shrink-0 border-b border-subtle px-4 pb-3 pt-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-[18px] font-bold text-paper">{date ? dayLabel(date).long : '—'}</h1>
              {day && (
                <span className="font-mono text-[11px] text-secondary">
                  <span className="text-orange">{formatInt(day.count)}</span> captures · {hhmm(day.firstTs)}–{hhmm(day.lastTs)} ·{' '}
                  {dayLoading ? '…' : dayApps.length} apps · {dayLoading ? '…' : sessions.length} vault notes
                </span>
              )}
              <span className="ml-auto font-mono text-[10px] text-muted">← → days · j k captures · f screenshot</span>
            </div>
            {/* App chips */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {dayApps.slice(0, 14).map(([app, n]) => (
                <button
                  key={app}
                  type="button"
                  onClick={() => setAppFilter((cur) => (cur === app ? null : app))}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                    appFilter === app ? 'border-orange/60 bg-orange/15 text-paper' : 'border-subtle text-secondary hover:border-highlight hover:text-paper',
                    appFilter && appFilter !== app && 'opacity-50',
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: appColor(app) }} />
                  {app}
                  <span className="font-mono text-[9px] text-muted">{n}</span>
                </button>
              ))}
            </div>
            <div className="mt-3">
              {dayLoading && !dayCaptures.length ? (
                <div className="h-[170px] animate-pulse rounded-md bg-panel" />
              ) : (
                <DayTimeline
                  captures={dayCaptures}
                  sessions={sessions}
                  selectedId={selectedId}
                  appFilter={appFilter}
                  onSelect={(id) => {
                    if (searching) setQueryInput('');
                    setSelectedId(id);
                    setTab('capture');
                  }}
                  onToggleApp={(app) => setAppFilter((cur) => (cur === app ? null : app))}
                />
              )}
            </div>
          </div>

          {notice && (
            <div role="status" className="flex shrink-0 items-start gap-2 border-b border-amber/30 bg-amber/10 px-4 py-1.5 text-[11px] leading-snug text-paper">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber" />
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{notice}</span>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice" className="text-muted hover:text-paper">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* List header */}
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-subtle px-4">
            <span className="hud-label">{searching ? 'Search results' : 'Captures'}</span>
            <span className="truncate font-mono text-[10px] text-muted">
              {listPending ? '…' : formatInt(visibleTotal)}
              {searching && ` match${visibleTotal === 1 ? '' : 'es'} for “${query}”${searchScope === 'day' ? ' this day' : ''}`}
            </span>
            {linkedId != null && date === linkedDate && (
              <button
                type="button"
                onClick={() => {
                  setSelectedId(linkedId);
                  setScrollToId(linkedId);
                  setTab('capture');
                }}
                title={linkedInList ? 'Jump to the capture from the link' : 'The linked capture is not in this list; it stays open in the inspector while selected'}
                className="flex shrink-0 items-center gap-1 rounded-full border border-amber/50 bg-amber/10 px-2 py-0.5 font-mono text-[10px] text-paper"
              >
                <Link2 className="h-3 w-3 text-amber" /> linked #{linkedId}
                {!listPending && !linkedInList && <span className="text-muted">· not in list</span>}
              </button>
            )}
            {range && !searching && (
              <button
                type="button"
                onClick={() => setRange(null)}
                className="flex max-w-[50%] items-center gap-1 truncate rounded-full border border-purple/50 bg-purple/10 px-2 py-0.5 text-[10px] text-paper"
              >
                <span className="truncate">Session: {range.label}</span> <X className="h-3 w-3 shrink-0" />
              </button>
            )}
            {appFilter && (
              <button
                type="button"
                onClick={() => setAppFilter(null)}
                className="flex items-center gap-1 rounded-full border border-orange/50 bg-orange/10 px-2 py-0.5 text-[10px] text-paper"
              >
                {appFilter} <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="hud-scroll min-h-0 flex-1 overflow-y-auto">
            {listPending && !visible.length ? (
              <div className="flex h-full animate-pulse items-center justify-center font-mono text-[11px] text-muted">
                {booting || dayPending ? 'Loading captures…' : 'Searching…'}
              </div>
            ) : (
              <CaptureList
                items={visible}
                selectedId={selectedId}
                linkedId={linkedId}
                scrollToId={scrollToId}
                onScrolled={onScrolled}
                query={query}
                showDate={searching && searchScope === 'all'}
                onSelect={(id) => {
                  setSelectedId(id);
                  setTab('capture');
                }}
                hasMore={searching ? results.items.length < results.total : dayLimit < dayFiltered.length}
                onMore={() => (searching ? void runSearch(results.items.length) : setDayLimit((l) => l + DAY_PAGE))}
                loading={searching ? searchLoading : dayLoading}
              />
            )}
          </div>
        </main>

        <CaptureInspector
          capture={capture}
          loading={captureLoading || listPending}
          error={captureError}
          query={query}
          sessions={sessions}
          tab={tab}
          onTab={setTab}
          onPrev={selIndex > 0 ? () => move(-1) : null}
          onNext={selIndex >= 0 && selIndex < visible.length - 1 ? () => move(1) : null}
          onCopy={copy}
          onOpenSession={openSession}
          lightbox={lightbox}
          onLightbox={setLightbox}
        />
      </div>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
