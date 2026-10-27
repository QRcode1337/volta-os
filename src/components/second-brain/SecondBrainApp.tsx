'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Cloud, HardDrive, Loader2, RotateCw, Search, TriangleAlert, X } from 'lucide-react';
import type { BrainNode, ModelTier, RoutineItem, SkillCardItem } from '@/types/os';
import { formatInt } from '@/lib/format';
import { isTypingTarget } from '@/lib/events';
import { cn } from '@/lib/cn';
import { PixelMascotLogo } from '@/components/robo-ui';
import { INSPECTOR_INSET, NodeInspector } from './NodeInspector';
import { Map2DView } from './Map2DView';
import { TimelineView } from './TimelineView';
import { RoutinesAnalyticsView } from './RoutinesAnalyticsView';
import { SkillsAnalyticsView } from './SkillsAnalyticsView';
import { ApplicationsView } from './ApplicationsView';
import { VIEWS, isViewId, type ViewId } from './shared';
import { matchGraphNodes, noteMatches, relTime, stubNode, vaultColor, type GraphModel, type GraphNode } from './graph-model';
import { useBrainGraph, useElapsed, useLastIndex, useLtmStatus, useNotesIndex, useNow, useVaults, type NotesIndex } from './graph-data';
import type { ObsidianVault } from '@/types/ltm';

const Orb3DView = dynamic(() => import('./Orb3DView').then((m) => m.Orb3DView), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <span className="hud-label robo-pulse rounded-full px-3 py-1">BOOTING ORB…</span>
    </div>
  ),
});

interface Toast {
  id: number;
  msg: string;
  kind: 'ok' | 'error';
}

const SEARCH_VIEWS: ViewId[] = ['orb', 'map', 'timeline'];
const GRAPH_MAX = 700;

// Legacy props still passed to the analytics views (they read their own real data and ignore these).
const NO_NODES: BrainNode[] = [];
const NO_ROUTINES: RoutineItem[] = [];
const NO_SKILLS: SkillCardItem[] = [];

interface SearchResult {
  id: string;
  title: string;
  vault: string;
  folder: string;
  color: string;
  inGraph: boolean;
  mtime: string;
}

interface SearchOutcome {
  items: SearchResult[];
  total: number;
  /** Hits that are part of the graph view (null while the graph isn't loaded). */
  inGraph: number | null;
  /** 'index' = full note index · 'graph' = graph notes only · 'none' = nothing loaded yet. */
  source: 'index' | 'graph' | 'none';
}

interface VaultInfo {
  name: string;
  color: string;
  lower: string;
}

/** Vault id → name/colour, from the graph model when loaded, else from /api/vaults. */
function vaultInfoMap(model: GraphModel | null, vaults: ObsidianVault[] | null): Map<string, VaultInfo> {
  const m = new Map<string, VaultInfo>();
  vaults?.forEach((v, i) => m.set(v.id, { name: v.name, color: vaultColor(v.name, i), lower: v.name.toLowerCase() }));
  model?.vaults.forEach((v) => m.set(v.id, { name: v.name, color: v.color, lower: v.name.toLowerCase() }));
  return m;
}

/**
 * Dropdown search. Same rule as the graph highlight (graph-model noteMatches: title, path/folder, vault
 * name), so "N in graph" agrees with the graph. Works from the full index even before the graph exists.
 */
function searchNotes(query: string, model: GraphModel | null, index: NotesIndex | null, vaults: ObsidianVault[] | null): SearchOutcome | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const info = vaultInfoMap(model, vaults);
  if (index) {
    const hits: { n: (typeof index.notes)[number]; g: GraphNode | undefined; starts: boolean }[] = [];
    for (const n of index.notes) {
      if (!noteMatches(q, n.lower, info.get(n.vaultId)?.lower ?? '')) continue;
      hits.push({ n, g: model?.byId.get(n.id), starts: n.title.toLowerCase().startsWith(q) });
    }
    hits.sort((a, b) => Number(!!b.g) - Number(!!a.g) || Number(b.starts) - Number(a.starts) || (b.g?.degree ?? 0) - (a.g?.degree ?? 0) || b.n.mtime.localeCompare(a.n.mtime));
    return {
      total: hits.length,
      inGraph: model ? hits.filter((h) => h.g).length : null,
      source: 'index',
      items: hits.slice(0, 8).map(({ n, g }) => {
        const v = info.get(n.vaultId);
        const folder = n.relPath.includes('/') ? n.relPath.split('/')[0] : '(root)';
        return {
          id: n.id,
          title: n.title,
          vault: v?.name ?? n.vaultId,
          folder,
          color: g?.color ?? model?.clusters.find((c) => c.vaultId === n.vaultId && c.folder === folder)?.color ?? v?.color ?? '#A39E93',
          inGraph: !!g,
          mtime: n.mtime,
        };
      }),
    };
  }
  if (model) {
    // Full index not loaded (yet / unavailable): search what the graph has, with the same rule.
    const hits = model.nodes.filter((n) => noteMatches(q, n.search, info.get(n.vaultId)?.lower ?? n.vault.toLowerCase()));
    hits.sort((a, b) => b.degree - a.degree);
    return {
      total: hits.length,
      inGraph: hits.length,
      source: 'graph',
      items: hits.slice(0, 8).map((n) => ({ id: n.id, title: n.label, vault: n.vault, folder: n.folder, color: n.color, inGraph: true, mtime: n.mtime })),
    };
  }
  return { items: [], total: 0, inGraph: null, source: 'none' };
}

/**
 * `?node=` deep-link value → note id, or null when it can never be a note. Ids are `${vaultId}:${relPath}`
 * (useSearchParams has already URL-decoded it). relPath must be a vault-relative `.md` path — `.md` is
 * case-sensitive, as in the server's walker and stubNode — with no leading `/` and no empty, `.` or `..` segment.
 * The server caps ids at 1,024 chars, and the note API re-validates the path anyway.
 */
function deepLinkNode(raw: string | null): string | null {
  if (!raw || raw.length > 1024) return null;
  // eslint-disable-next-line no-control-regex
  const m = /^[A-Za-z0-9_-]{1,64}:([^\u0000-\u001f]+)$/.exec(raw);
  if (!m) return null;
  const relPath = m[1];
  if (!relPath.endsWith('.md') || relPath.length <= 3) return null;
  if (relPath.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) return null;
  return raw;
}

/** 5862 → "5.9K", 12541 → "12.5K", 186420 → "186K". */
function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 100_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${Math.round(n / 1000)}K`;
}

export function SecondBrainApp() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlView = params.get('view');
  const [view, setView] = useState<ViewId>(isViewId(urlView) ? urlView : 'orb');

  // Keep state in sync when the URL changes (back/forward).
  useEffect(() => {
    if (isViewId(urlView) && urlView !== view) setView(urlView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlView]);

  const switchView = useCallback(
    (v: ViewId) => {
      setView(v);
      const sp = new URLSearchParams(params.toString());
      sp.set('view', v);
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  // ── Real data ──
  const { state: graph, retry } = useBrainGraph(GRAPH_MAX);
  const model = graph.model;
  const ltm = useLtmStatus();
  const vaultList = useVaults();
  const lastIndex = useLastIndex();
  const nowMs = useNow(60_000);
  const graphLoading = !model && graph.status === 'loading';
  const elapsed = useElapsed(graphLoading);

  // ── Search ──
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeResult, setActiveResult] = useState(0);
  const [wantIndex, setWantIndex] = useState(false);
  const [indexNonce, setIndexNonce] = useState(0); // bumped on focus/selection → refresh a stale index, retry after an error
  const { index: notesIndex, status: indexStatus } = useNotesIndex(wantIndex, indexNonce);
  const requestIndex = useCallback(() => {
    setWantIndex(true);
    setIndexNonce((n) => n + 1);
  }, []);
  const searchRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => (model ? matchGraphNodes(deferredQuery, model.nodes) : null), [deferredQuery, model]);
  const results = useMemo(() => searchNotes(deferredQuery, model, notesIndex, vaultList), [deferredQuery, model, notesIndex, vaultList]);
  useEffect(() => setActiveResult(0), [deferredQuery]);

  // ── Inspection drawers ──
  // Deep link: /second-brain?view=map&node=<vaultId:relPath> selects the note (inspector + markdown drawer open at
  // once, before the graph exists) and, once the graph has loaded, the orb / map centres it (pendingFocus).
  const deepNode = deepLinkNode(params.get('node'));
  const [selectedId, setSelectedId] = useState<string | null>(deepNode);
  const [pendingFocus, setPendingFocus] = useState<string | null>(deepNode);
  const clearFocus = useCallback(() => setPendingFocus(null), []);
  const selected = useMemo<GraphNode | null>(() => {
    if (!selectedId) return null;
    const g = model?.byId.get(selectedId);
    if (g) return g;
    const meta = notesIndex?.byId.get(selectedId);
    const vid = selectedId.slice(0, Math.max(0, selectedId.indexOf(':')));
    const vi = vaultList ? vaultList.findIndex((v) => v.id === vid) : -1;
    // Before the graph exists, a vault the vault list doesn't know can't be a note either (stubNode only checks the model).
    if (!model && vaultList && vi < 0) return null;
    const hint = vaultList && vi >= 0 ? { name: vaultList[vi].name, color: vaultColor(vaultList[vi].name, vi) } : null;
    return stubNode(selectedId, model, meta?.mtime, hint);
  }, [selectedId, model, notesIndex, vaultList]);
  // A selection that can't resolve to a note (unknown vault, once the graph or vault list is known) is dropped, which
  // also removes ?node= below — the URL and Esc never act on an invisible selection.
  const selectionKnown = !!model || !!vaultList;
  useEffect(() => {
    if (selectedId && !selected && selectionKnown) {
      setSelectedId(null);
      setPendingFocus(null);
    }
  }, [selectedId, selected, selectionKnown]);
  const selectNode = useCallback(
    (id: string) => {
      setSelectedId(id);
      requestIndex(); // links to notes outside the graph resolve through the full index
    },
    [requestIndex],
  );
  const closeInspector = useCallback(() => setSelectedId(null), []);

  // A deep link at mount needs the full index too (notes outside the graph resolve their metadata through it).
  useEffect(() => {
    if (deepNode) requestIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A later ?node= change (client navigation from VOLTA Search while this page is open, back/forward).
  // The URL is kept in sync with the selection below, so an unchanged or self-written value is a no-op.
  useEffect(() => {
    if (!deepNode || deepNode === stateRef.current.selectedId) return;
    setSelectedId(deepNode);
    setPendingFocus(deepNode);
    requestIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepNode]);

  // Selection → ?node= (history.replaceState: no navigation, no server round trip; Next keeps useSearchParams in
  // sync), so the address bar is always a working deep link and a closed note doesn't reopen on reload.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if ((sp.get('node') ?? null) === selectedId) return;
    if (selectedId) sp.set('node', selectedId);
    else sp.delete('node');
    const qs = sp.toString();
    window.history.replaceState(null, '', `${pathname}${qs ? `?${qs}` : ''}`);
  }, [selectedId, pathname]);

  // The graph only holds the most-linked notes: a deep-linked note outside it opens in the drawers but can't be
  // centred, so drop the request once the graph is known.
  useEffect(() => {
    if (pendingFocus && model && !model.byId.has(pendingFocus)) setPendingFocus(null);
  }, [pendingFocus, model]);

  /** Exact vault paths first (in order), then Obsidian-style lookup by note name (basename of the first). */
  const resolveLink = useCallback(
    (vaultId: string, target: string | string[]) => {
      const list = (Array.isArray(target) ? target : [target]).map((t) => t.trim().replace(/^\/+/, '')).filter(Boolean);
      if (!list.length) return null;
      for (const t of list) {
        if (!t.includes('/') && !/\.md$/i.test(t)) continue; // bare names resolve by name below
        const id = `${vaultId}:${/\.md$/i.test(t) ? t : `${t}.md`}`;
        if (model?.byId.has(id) || notesIndex?.byId.has(id)) return id;
      }
      const name = (list[0].split('/').pop() ?? list[0]).replace(/\.md$/i, '').trim().toLowerCase();
      if (!name) return null;
      return model?.labelIndex.get(`${vaultId}|${name}`) ?? notesIndex?.byVaultTitle.get(`${vaultId}|${name}`) ?? null;
    },
    [model, notesIndex],
  );

  // ── Legacy analytics state (still passed; the rewritten views ignore it) ──
  const [skillRoutes, setSkillRoutes] = useState<Record<string, ModelTier>>({});
  const [routineModes, setRoutineModes] = useState<Record<string, 'ACTIVE' | 'PASSIVE'>>({});
  const [budgetCap, setBudgetCap] = useState(10);
  const [connectorEnabled, setConnectorEnabled] = useState<Record<string, boolean>>({});

  // ── Toasts ──
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);
  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-2), { id, msg, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  // ── Keyboard ──
  const stateRef = useRef({ selectedId, query, view });
  stateRef.current = { selectedId, query, view };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const st = stateRef.current;
        // The inspector only shows on the orb/map/timeline; elsewhere Esc goes straight to the search query.
        if (st.selectedId && SEARCH_VIEWS.includes(st.view)) {
          setSelectedId(null);
        } else if (st.query) {
          setQuery('');
        }
        if (document.activeElement === searchRef.current) searchRef.current?.blur();
        return;
      }
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= VIEWS.length) {
        e.preventDefault();
        switchView(VIEWS[n - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [switchView]);

  const showInspector = !!selected && SEARCH_VIEWS.includes(view);
  const insetLeft = showInspector ? INSPECTOR_INSET.left : 0;
  const insetRight = showInspector ? INSPECTOR_INSET.right : 0;
  const matchCount = matches?.size ?? null;
  const showResults = searchFocused && !!query.trim() && SEARCH_VIEWS.includes(view) && !!results;
  const showGraphCount = matchCount !== null && !!query.trim() && (view === 'orb' || view === 'map');

  const pickResult = (id: string) => {
    selectNode(id);
    searchRef.current?.blur();
  };

  // ── Badge text (full at 2xl, compact below so the search keeps its width) ──
  const vaultCount = model?.vaults.length ?? vaultList?.length ?? lastIndex?.vaults ?? null;
  const notesLabel = model ? `${formatInt(model.totalNotes)} NOTES` : graph.status === 'error' ? 'GRAPH OFFLINE' : 'INDEXING NOTES';
  const vaultsLabel = vaultCount != null ? `${vaultCount} VAULT${vaultCount === 1 ? '' : 'S'}` : '— VAULTS';
  const ltmLabel = ltm.status === 'ok' ? `${formatInt(ltm.total)} CAPTURES` : ltm.status === 'offline' ? 'LTM OFFLINE' : '— CAPTURES';
  const notesShort = model ? `${compactCount(model.totalNotes)} NOTES` : graph.status === 'error' ? 'GRAPH OFFLINE' : 'INDEXING…';
  const vaultsShort = vaultCount != null ? `${vaultCount}V` : '—V';
  const ltmShort = ltm.status === 'ok' ? `${compactCount(ltm.total)} LTM` : ltm.status === 'offline' ? 'LTM OFF' : '— LTM';
  const badgeTitle = [
    `${notesLabel} · ${vaultsLabel} · ${ltmLabel}`,
    model ? `Obsidian vault index · ${formatInt(model.totalLinks)} wikilinks · ${formatInt(model.skippedFiles)} iCloud-only/oversized notes not scanned for links` : null,
    ltm.status === 'ok' ? 'Captures = unvolta-ltm screen captures' : null,
  ]
    .filter(Boolean)
    .join('\n');
  const badgeDot = model ? (ltm.status === 'offline' ? 'bg-amber' : 'bg-green') : graph.status === 'error' ? 'bg-red-500' : 'bg-amber robo-pulse';

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-paper">
      <style>{`
        @keyframes sb-in-left { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: none; } }
        @keyframes sb-in-right { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
        @keyframes sb-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes sb-scan { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
        @keyframes sb-orbit { to { transform: rotate(360deg); } }
        .sb-drawer-left { animation: sb-in-left 260ms cubic-bezier(.2,.8,.2,1) both; }
        .sb-drawer-right { animation: sb-in-right 300ms cubic-bezier(.2,.8,.2,1) both; }
        .sb-fade-up { animation: sb-fade-up 320ms cubic-bezier(.2,.8,.2,1) both; }
        .sb-scan { animation: sb-scan 1.6s cubic-bezier(.45,0,.55,1) infinite; }
        .sb-orbit { animation: sb-orbit 2.4s linear infinite; }
        .sb-orbit-slow { animation: sb-orbit 5s linear infinite reverse; }
        .sb-grid-bg {
          background-image: radial-gradient(circle at 50% 45%, rgba(255,85,0,0.06), transparent 55%),
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 100% 100%, 40px 40px, 40px 40px;
        }
      `}</style>

      {/* ── Top bar ── (fixed-width groups stay compact below 2xl so the search keeps ≥ 220px at 1280) */}
      <header className="relative z-40 flex h-[calc(3.5rem+env(safe-area-inset-top,0px))] shrink-0 items-center gap-2 border-b border-subtle bg-panel/90 px-3 pt-[env(safe-area-inset-top,0px)] backdrop-blur md:h-14 md:gap-3 md:pt-0">
        <div className="flex min-w-0 shrink items-center gap-2 md:gap-3">
          <Link
            href="/"
            title="Back to VOLTA OS"
            aria-label="Back to VOLTA OS"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-subtle bg-panel-elevated font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-highlight hover:text-paper md:h-8 md:w-auto md:px-2.5 2xl:px-3"
          >
            <ArrowLeft size={13} />
            <span className="hidden 2xl:inline">Back to VOLTA OS</span>
          </Link>
          <span className="shrink-0 max-[400px]:hidden">
            <PixelMascotLogo size={24} />
          </span>
          <h1 className="max-md:sr-only flex min-w-0 items-baseline gap-1.5 overflow-hidden whitespace-nowrap text-[17px] font-bold tracking-tight">
            <span className="hidden lg:inline">VOLTA</span>
            <span className="truncate font-doto font-bold text-orange">SECOND BRAIN</span>
          </h1>
          <span
            className="hidden shrink-0 items-center gap-1.5 rounded-full border border-subtle bg-obsidian px-2.5 py-1 font-mono text-[9.5px] font-semibold tracking-[0.1em] text-secondary xl:inline-flex"
            title={badgeTitle}
            aria-label={`${notesLabel} · ${vaultsLabel} · ${ltmLabel}`}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', badgeDot)} />
            <span className="2xl:hidden">
              {notesShort} · {vaultsShort} · {ltmShort}
            </span>
            <span className="hidden 2xl:inline">
              {notesLabel} · {vaultsLabel} · {ltmLabel}
            </span>
          </span>
        </div>

        <div className="mx-auto flex min-w-[220px] max-w-[460px] flex-1 justify-center max-md:mx-0 max-md:min-w-0">
          <div className="relative w-full max-md:static">
            <label className="group relative flex h-9 w-full items-center">
              <Search size={14} className="pointer-events-none absolute left-3 text-muted group-focus-within:text-orange" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => {
                  setSearchFocused(true);
                  requestIndex();
                }}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={(e) => {
                  if (!SEARCH_VIEWS.includes(view)) return;
                  if (e.key === 'ArrowDown' && results?.items.length) {
                    e.preventDefault();
                    setActiveResult((i) => Math.min(results.items.length - 1, i + 1));
                  } else if (e.key === 'ArrowUp' && results?.items.length) {
                    e.preventDefault();
                    setActiveResult((i) => Math.max(0, i - 1));
                  } else if (e.key === 'Enter') {
                    const pick = results?.items[activeResult] ?? results?.items[0];
                    if (pick) pickResult(pick.id);
                  }
                }}
                placeholder={model ? `Search ${formatInt(model.totalNotes)} notes… (/)` : 'Search notes… (/)'}
                className={cn(
                  'h-full w-full min-w-0 rounded-full border border-subtle bg-obsidian pl-9 font-mono text-[12px] text-paper outline-none transition-colors placeholder:text-muted focus:border-orange/60 focus:shadow-[0_0_0_3px_rgba(255,85,0,0.12)]',
                  query ? (showGraphCount ? 'pr-[4.25rem]' : 'pr-9') : 'pr-9',
                )}
                aria-label="Search notes"
                aria-expanded={showResults}
              />
              <span className="absolute right-2 flex items-center gap-1">
                {showGraphCount && (
                  <span
                    className={cn(
                      'pointer-events-none rounded-full border px-1.5 font-mono text-[9.5px] leading-4',
                      matchCount ? 'border-orange/40 text-orange' : 'border-subtle text-muted',
                    )}
                    title={`${formatInt(matchCount ?? 0)} notes highlighted in the graph`}
                  >
                    {compactCount(matchCount ?? 0)}
                  </span>
                )}
                {query ? (
                  <button type="button" onClick={() => setQuery('')} className="rounded-full p-0.5 text-muted hover:text-paper" aria-label="Clear search">
                    <X size={12} />
                  </button>
                ) : (
                  <kbd className="pointer-events-none mr-1 rounded max-md:hidden border border-subtle px-1.5 font-mono text-[10px] text-muted">/</kbd>
                )}
              </span>
            </label>

            {showResults && results && (
              <div className="sb-fade-up absolute left-0 top-full z-50 mt-1.5 w-full min-w-[320px] overflow-hidden max-md:left-3 max-md:right-3 max-md:w-auto max-md:min-w-0 rounded-xl border border-subtle bg-panel-elevated/95 shadow-2xl shadow-black/60 backdrop-blur">
                {results.items.length === 0 ? (
                  <div className="px-3 py-3 font-mono text-[11px] text-muted">
                    {results.source === 'none'
                      ? indexStatus === 'error'
                        ? 'Note index unavailable and the graph is still building — try again in a moment.'
                        : 'Loading the note index…'
                      : `No note titles, folders or vaults match “${query.trim()}”.`}
                  </div>
                ) : (
                  <ul className="py-1">
                    {results.items.map((r, i) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setActiveResult(i)}
                          onClick={() => pickResult(r.id)}
                          className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors', i === activeResult ? 'bg-panel-hover' : '')}
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] text-paper">{r.title}</span>
                            <span className="block truncate font-mono text-[9.5px] text-muted">
                              {r.vault} / {r.folder === '(root)' ? 'root' : r.folder}
                            </span>
                          </span>
                          {r.inGraph ? (
                            <span className="shrink-0 rounded-full border border-orange/40 px-1.5 py-px font-mono text-[8.5px] tracking-widest text-orange">IN GRAPH</span>
                          ) : (
                            <span className="shrink-0 font-mono text-[9.5px] text-muted">{relTime(r.mtime, nowMs)}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center justify-between gap-2 border-t border-subtle px-3 py-1.5 font-mono text-[9.5px] text-muted">
                  <span className="truncate">
                    {results.source !== 'none' && (
                      <>
                        {formatInt(results.total)} match{results.total === 1 ? '' : 'es'}
                        {results.source === 'index' && results.inGraph !== null ? ` · ${formatInt(results.inGraph)} in graph view` : ''}
                        {results.source === 'index' && results.inGraph === null ? ' · graph still building' : ''}
                      </>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {indexStatus === 'loading' && (
                      <>
                        <Loader2 size={10} className="robo-spin" /> loading full index…
                      </>
                    )}
                    {indexStatus === 'error' && results.source === 'graph' && 'graph notes only (index unavailable)'}
                    {indexStatus === 'ready' && results.items.length > 0 && '↵ open · ↑↓ move'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <nav className="flex shrink-0 items-center gap-0.5 rounded-full border border-subtle bg-obsidian p-0.5 max-md:max-w-[42vw] max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden">
          {VIEWS.map((v, i) => (
            <button
              key={v.id}
              type="button"
              onClick={() => switchView(v.id)}
              title={`${v.label} (${i + 1})`}
              aria-keyshortcuts={String(i + 1)}
              className={cn(
                'relative inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 font-mono text-[10.5px] md:h-7 font-semibold tracking-wide transition-colors',
                view === v.id ? 'bg-orange text-obsidian shadow-[0_0_14px_rgba(255,85,0,0.35)]' : 'text-secondary hover:bg-panel-hover hover:text-paper',
              )}
            >
              <span className={cn('hidden text-[9px] 2xl:inline', view === v.id ? 'text-obsidian/70' : 'text-muted')}>{i + 1}</span>
              {v.label}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Active view ── */}
      <main className="relative min-h-0 flex-1">
        {(view === 'orb' || view === 'map') &&
          (model ? (
            model.nodes.length > 0 ? (
              view === 'orb' ? (
                <Orb3DView
                  model={model}
                  matches={matches}
                  selectedId={selectedId}
                  onSelect={selectNode}
                  insetLeft={insetLeft}
                  insetRight={insetRight}
                  focusId={pendingFocus && model.byId.has(pendingFocus) ? pendingFocus : null}
                  onFocused={clearFocus}
                />
              ) : (
                <Map2DView
                  model={model}
                  matches={matches}
                  selectedId={selectedId}
                  onSelect={selectNode}
                  insetLeft={insetLeft}
                  insetRight={insetRight}
                  focusId={pendingFocus && model.byId.has(pendingFocus) ? pendingFocus : null}
                  onFocused={clearFocus}
                />
              )
            ) : (
              <GraphNotice
                icon={<HardDrive size={18} />}
                title="No notes found"
                body="None of the Obsidian vaults registered on this Mac contain Markdown notes VOLTA can read. Open a vault in Obsidian and reload."
              />
            )
          ) : graph.status === 'error' ? (
            <GraphNotice
              icon={<TriangleAlert size={18} />}
              title="Couldn't build the vault graph"
              body={`/api/brain/graph failed: ${graph.message}`}
              action={
                <button
                  type="button"
                  onClick={retry}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-orange bg-orange px-3.5 font-mono text-[10.5px] font-semibold text-obsidian hover:brightness-110"
                >
                  <RotateCw size={12} /> RETRY
                </button>
              }
            />
          ) : (
            <GraphLoading elapsed={elapsed} vaults={vaultList} lastNotes={lastIndex?.notes ?? null} lastVaults={lastIndex?.vaults ?? null} />
          ))}
        {view === 'timeline' && <TimelineView nodes={NO_NODES} query={query} onSelectNode={selectNode} ltm={ltm} />}
        {view === 'routines' && (
          <RoutinesAnalyticsView
            routines={NO_ROUTINES}
            query={query}
            modes={routineModes}
            onToggleMode={(id, mode) => setRoutineModes((m) => ({ ...m, [id]: mode }))}
            cap={budgetCap}
            onCap={setBudgetCap}
          />
        )}
        {view === 'skills' && (
          <SkillsAnalyticsView
            skills={NO_SKILLS}
            query={query}
            routes={skillRoutes}
            onRoute={(id, tier) => {
              setSkillRoutes((r) => ({ ...r, [id]: tier }));
              toast(`${id} re-routed → ${tier}`, 'ok');
            }}
          />
        )}
        {view === 'apps' && (
          <ApplicationsView query={query} enabled={connectorEnabled} onToggle={(id, on) => setConnectorEnabled((m) => ({ ...m, [id]: on }))} />
        )}

        {showInspector && selected && (
          <NodeInspector node={selected} model={model} onSelect={selectNode} onClose={closeInspector} toast={toast} nowMs={nowMs} resolveLink={resolveLink} />
        )}
      </main>

      {/* ── Toasts ── */}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'sb-fade-up pointer-events-auto flex items-center gap-2 rounded-full border bg-panel-elevated px-4 py-2 font-mono text-[11px] shadow-xl shadow-black/50',
              t.kind === 'ok' ? 'border-green/40 text-paper' : 'border-red-500/50 text-paper',
            )}
          >
            {t.kind === 'ok' ? <CheckCircle2 size={13} className="text-green" /> : <TriangleAlert size={13} className="text-red-400" />}
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

function GraphLoading({
  elapsed,
  vaults,
  lastNotes,
  lastVaults,
}: {
  elapsed: number;
  vaults: { id: string; name: string; location: 'icloud' | 'local'; notes: number }[] | null;
  lastNotes: number | null;
  lastVaults: number | null;
}) {
  // /api/vaults failing leaves `vaults` null (unknown, not zero) → fall back to the last successful index.
  const vaultCount = vaults?.length ?? lastVaults;
  const hint =
    lastNotes != null
      ? `Indexing ${formatInt(lastNotes)} notes across ${vaultCount ?? '…'} vault${vaultCount === 1 ? '' : 's'}…`
      : vaultCount != null
        ? `Indexing notes across ${vaultCount} vault${vaultCount === 1 ? '' : 's'}…`
        : 'Indexing your Obsidian vaults…';
  return (
    <div className="sb-grid-bg flex h-full w-full items-center justify-center">
      <div className="sb-fade-up hud-card flex w-[min(440px,calc(100vw-2rem))] flex-col items-center gap-4 px-6 py-7 text-center shadow-2xl shadow-black/50">
        <div className="relative h-16 w-16">
          <div className="sb-orbit absolute inset-0 rounded-full border-2 border-transparent border-t-orange border-r-orange/40" />
          <div className="sb-orbit-slow absolute inset-2 rounded-full border border-dashed border-orange/35" />
          <div className="absolute inset-[26px] rounded-full bg-orange shadow-[0_0_18px_rgba(255,85,0,0.7)]" />
        </div>
        <div>
          <div className="hud-label !text-[10px] !text-orange">BUILDING WIKILINK GRAPH</div>
          <div className="mt-1.5 text-[15px] font-semibold text-paper">{hint}</div>
          <div className="mt-1 font-mono text-[10.5px] text-muted">
            {elapsed}s · a cold index reads every note (~10–15s), then it&apos;s cached for 10 min
          </div>
        </div>
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-panel-hover" aria-hidden>
          <div className="sb-scan absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r from-transparent via-orange to-transparent" />
        </div>
        {vaults && vaults.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5">
            {vaults.map((v) => (
              <span key={v.id} className="inline-flex items-center gap-1 rounded-full border border-subtle bg-obsidian px-2 py-0.5 font-mono text-[9.5px] text-secondary">
                {v.location === 'icloud' ? <Cloud size={10} className="text-muted" /> : <HardDrive size={10} className="text-muted" />}
                {v.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GraphNotice({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="sb-grid-bg flex h-full w-full items-center justify-center">
      <div className="sb-fade-up hud-card flex w-[min(440px,calc(100vw-2rem))] flex-col items-center gap-2.5 px-6 py-7 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-subtle bg-panel-elevated text-secondary">{icon}</div>
        <div className="text-[15px] font-semibold text-paper">{title}</div>
        <p className="max-w-[360px] break-words font-mono text-[11px] leading-relaxed text-muted">{body}</p>
        {action && <div className="mt-1">{action}</div>}
      </div>
    </div>
  );
}

export default SecondBrainApp;
