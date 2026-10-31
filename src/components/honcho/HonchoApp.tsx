'use client';
// Honcho GUI (self-hosted Plastic Labs memory server, read-only apart from dialectic chat/queries).
//
// Deep links — /apps/honcho?… (VOLTA Search and other widgets link here). Every param is optional;
// ids are Honcho ids exactly as the API returns them (URL-encode them):
//   w=<workspace>        workspace to open (alias: workspace=). Default: the first workspace.
//   tab=peers|sessions|conclusions|search
//                        Default: `sessions` when `session` is given, `search` when only `q` is given, else `peers`.
//   peer=<peer>          peer selected in the left rail (Peers / Conclusions / Ask follow it).
//   session=<session>    session opened in the Sessions tab.
//   message=<id>         message to scroll to and ring inside `session` (needs `session`). The thread opens on
//                        a window around it.
//   at=<ISO created_at>  the message's created_at, e.g. 2026-10-21T17:57:01.243Z (encode `+` as %2B). Optional:
//                        without it the app looks the message up first (GET …/sessions/<s>/messages/<id>).
//   q=<text>             prefills the search box and runs it; also highlights the words in the linked message.
// Examples:
//   /apps/honcho?w=openclaw&session=<s>&message=<id>&at=<created_at>&q=<query>   open a search hit in its thread
//   /apps/honcho?w=openclaw&peer=owner                                           a peer's card + representation
// If the message is gone or outside the loaded window, a notice says so and the thread still opens.
// The URL is kept in step (replaceState): w, tab, peer, session, message/at while a message is focused, q.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookUser, Lightbulb, Loader2, MessageCircleQuestion, MessagesSquare, RefreshCw, Search, X } from 'lucide-react';
import type { HonchoMessage, HonchoPage, HonchoPeer, HonchoQueueResponse, HonchoStats, HonchoStatus, HonchoWorkspace } from '@/types/honcho';
import { cn } from '@/lib/cn';
import { isTypingTarget } from '@/lib/events';
import { AppTopBar } from '@/components/elements/kit/AppTopBar';
import { ToastStack, useToasts } from '@/components/elements/kit/toast';
import { copyText } from '@/components/elements/kit/clipboard';
import { useVisiblePoll } from '@/components/ltm/useVisiblePoll';
import { HonchoClientError, hGet, isAbort, isOffline, shortId, wsUrl } from './honcho-client';
import { HonchoOfflineContext } from './useHoncho';
import { HonchoOffline } from './HonchoOffline';
import { HonchoRail } from './HonchoRail';
import { PeersTab } from './PeersTab';
import { SessionsTab } from './SessionsTab';
import { ConclusionsTab } from './ConclusionsTab';
import { SearchTab, type SearchScope } from './SearchTab';
import { AskPanel } from './AskPanel';
import { MOBILE_MEDIA_QUERY } from '@/components/mobile/constants';
import type { MessageFocus } from './MessageThread';

type Tab = 'peers' | 'sessions' | 'conclusions' | 'search';
type Conn = 'checking' | 'online' | 'offline';

const TABS: { id: Tab; label: string; icon: typeof BookUser }[] = [
  { id: 'peers', label: 'Peers', icon: BookUser },
  { id: 'sessions', label: 'Sessions', icon: MessagesSquare },
  { id: 'conclusions', label: 'Conclusions', icon: Lightbulb },
  { id: 'search', label: 'Search', icon: Search },
];
const RETRY_SECONDS = 15;
const QUEUE_POLL_MS = 60_000;

/** `at=` → ISO string, or null. A literal `+` in a query string decodes to a space, so "…:01 00:00" is repaired. */
function parseAt(v: string | null): string | null {
  if (!v) return null;
  const t = Date.parse(v.trim().replace(/ (\d\d:?\d\d)$/, '+$1'));
  // Millisecond precision is enough: the thread window is "before at" + "from at (inclusive)".
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function HonchoApp() {
  const { toasts, push, dismiss } = useToasts();

  // ── Connection ──
  const [conn, setConn] = useState<Conn>('checking');
  const [status, setStatus] = useState<HonchoStatus | null>(null);
  const [offlineError, setOfflineError] = useState<string | null>(null);
  const [offlineUrl, setOfflineUrl] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RETRY_SECONDS);

  // ── Data ──
  const [workspaces, setWorkspaces] = useState<HonchoWorkspace[]>([]);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [peers, setPeers] = useState<HonchoPeer[]>([]);
  const [peersTotal, setPeersTotal] = useState(0);
  const [peersLoading, setPeersLoading] = useState(false);
  const [stats, setStats] = useState<HonchoStats | null>(null);
  const [queue, setQueue] = useState<HonchoQueueResponse | null>(null);

  // ── Navigation ──
  const [tab, setTab] = useState<Tab>('peers');
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [focus, setFocus] = useState<MessageFocus | null>(null);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('workspace');
  const [reloadKey, setReloadKey] = useState(0);
  const [askOpen, setAskOpen] = useState(true);
  // Phones: the Ask panel is a full-screen sheet there, so start closed instead of covering the app.
  useEffect(() => {
    if (window.matchMedia(MOBILE_MEDIA_QUERY).matches) setAskOpen(false);
  }, []);

  const searchRef = useRef<HTMLInputElement>(null);
  const urlInit = useRef<{ w?: string; tab?: string; peer?: string; session?: string } | null>(null);
  /** ?message= without ?at=: looked up once the workspace is known. */
  const linkLookup = useRef<{ session: string; message: string; query?: string } | null>(null);
  const [linkPending, setLinkPending] = useState(false);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);

  const reportOffline = useCallback((reason: string) => {
    setOfflineError(reason);
    setConn('offline');
    setSecondsLeft(RETRY_SECONDS);
  }, []);

  const probe = useCallback(async () => {
    setProbing(true);
    try {
      const s = await hGet<HonchoStatus>('/api/honcho/status');
      setStatus(s);
      setOfflineError(null);
      const ws = await hGet<HonchoPage<HonchoWorkspace>>('/api/honcho/workspaces');
      setWorkspaces(ws.items);
      setConn('online');
    } catch (err) {
      if (err instanceof HonchoClientError) {
        if (err.offline) {
          if (err.url) setOfflineUrl(err.url);
          reportOffline(err.message);
        } else {
          // Honcho answered but errored (e.g. DB migrating): treat as offline-ish with the detail.
          reportOffline(`${err.message} (HTTP ${err.status})`);
        }
      } else {
        reportOffline((err as Error).message || 'Network error');
      }
    } finally {
      setProbing(false);
    }
  }, [reportOffline]);

  // Read deep-link params once (see the header comment), then probe.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const param = (k: string) => sp.get(k)?.trim() || undefined;
    urlInit.current = {
      w: param('w') ?? param('workspace'),
      tab: param('tab'),
      peer: param('peer'),
      session: param('session'),
    };
    const { tab: t, session: s } = urlInit.current;
    const message = param('message');
    const q = param('q')?.slice(0, 500);
    if (t && TABS.some((x) => x.id === t)) setTab(t as Tab);
    else if (s) setTab('sessions');
    else if (q) setTab('search');
    if (q) {
      setQueryInput(q);
      setQuery(q);
    }
    if (s && message) {
      const at = parseAt(sp.get('at'));
      if (at) {
        setSession(s);
        setFocus({ id: message, created_at: at, query: q });
      } else {
        linkLookup.current = { session: s, message, query: q };
        setLinkPending(true);
      }
    } else if (s) {
      setSession(s);
    } else if (message) {
      setLinkNotice(`The link names message ${shortId(message, 24)} but no session — open it from its session.`);
    }
    setAskOpen(window.innerWidth >= 1280); // narrow screens: Ask panel starts closed (overlay)
    void probe();
  }, [probe]);

  // ?message= without ?at=: fetch the message for its created_at, then open the thread around it.
  useEffect(() => {
    const link = linkLookup.current;
    if (!link || conn !== 'online' || !workspace) return;
    linkLookup.current = null;
    const ac = new AbortController();
    let settled = false;
    hGet<HonchoMessage>(wsUrl(workspace, ['sessions', link.session, 'messages', link.message]), ac.signal)
      .then((m) => {
        setSession(link.session);
        setFocus({ id: m.id, created_at: m.created_at, query: link.query });
      })
      .catch((err) => {
        if (isAbort(err)) return;
        if (isOffline(err)) reportOffline((err as Error).message);
        setSession(link.session);
        setLinkNotice(
          err instanceof HonchoClientError && err.status === 404
            ? `Message ${shortId(link.message, 24)} from the link isn't in session ${shortId(link.session, 40)} (deleted, or wrong ids) — showing the session's latest messages.`
            : `Couldn't open the linked message: ${(err as Error).message}`,
        );
      })
      .finally(() => {
        settled = true;
        setLinkPending(false);
      });
    return () => {
      ac.abort();
      if (!settled) setLinkPending(false); // workspace changed mid-lookup: the link no longer applies
    };
  }, [conn, workspace, reportOffline]);

  // Offline: countdown + auto-retry every 15s. Paused while the tab is hidden (no background re-probes).
  useEffect(() => {
    if (conn !== 'offline') return;
    const t = setInterval(() => {
      if (!document.hidden) setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [conn]);
  useEffect(() => {
    if (conn === 'offline' && secondsLeft === 0 && !probing) {
      setSecondsLeft(RETRY_SECONDS);
      void probe();
    }
  }, [conn, secondsLeft, probing, probe]);

  // Pick a workspace once we have the list.
  useEffect(() => {
    if (!workspaces.length) return;
    if (workspace && workspaces.some((w) => w.id === workspace)) return;
    const wanted = urlInit.current?.w;
    setWorkspace(wanted && workspaces.some((w) => w.id === wanted) ? wanted : workspaces[0].id);
  }, [workspaces, workspace]);

  // Peers for the workspace (all pages up to 500).
  useEffect(() => {
    if (conn !== 'online' || !workspace) return;
    const ac = new AbortController();
    setPeersLoading(true);
    (async () => {
      const first = await hGet<HonchoPage<HonchoPeer>>(wsUrl(workspace, ['peers'], { page: 1, size: 100 }), ac.signal);
      const all = [...first.items];
      for (let p = 2; p <= first.pages && all.length < 500; p++) {
        all.push(...(await hGet<HonchoPage<HonchoPeer>>(wsUrl(workspace, ['peers'], { page: p, size: 100 }), ac.signal)).items);
      }
      setPeers(all);
      setPeersTotal(first.total);
      setSelectedPeer((cur) => {
        if (cur && all.some((x) => x.id === cur)) return cur;
        const wanted = urlInit.current?.peer;
        if (wanted && all.some((x) => x.id === wanted)) return wanted;
        return all[0]?.id ?? null;
      });
    })()
      .catch((err) => {
        if (isAbort(err)) return;
        if (isOffline(err)) reportOffline((err as Error).message);
        else push(`Couldn't load peers: ${(err as Error).message}`, { tone: 'error' });
      })
      .finally(() => {
        if (!ac.signal.aborted) setPeersLoading(false);
      });
    return () => ac.abort();
  }, [conn, workspace, reloadKey, reportOffline, push]);

  // Counts (slower fan-out; loads after the list).
  useEffect(() => {
    if (conn !== 'online' || !workspace) return;
    const ac = new AbortController();
    setStats(null);
    hGet<HonchoStats>(wsUrl(workspace, ['stats'], { fresh: reloadKey ? 1 : undefined }), ac.signal)
      .then(setStats)
      .catch((err) => {
        if (isAbort(err)) return;
        if (isOffline(err)) reportOffline((err as Error).message);
      });
    return () => ac.abort();
  }, [conn, workspace, reloadKey, reportOffline]);

  // Queue + health poll: now, then every 60s while the tab is visible (paused while hidden; on return it
  // refreshes at once only if a full interval has passed). Restarts on workspace change or Reload.
  const loadQueue = useCallback(() => {
    if (!workspace) return;
    const ac = new AbortController();
    hGet<HonchoQueueResponse>(wsUrl(workspace, ['queue']), ac.signal)
      .then(setQueue)
      .catch((err) => {
        if (isAbort(err)) return;
        if (isOffline(err)) reportOffline((err as Error).message);
      });
    hGet<HonchoStatus>('/api/honcho/status', ac.signal)
      .then(setStatus)
      .catch((err) => {
        if (isAbort(err)) return;
        if (isOffline(err)) reportOffline((err as Error).message);
      });
    return () => ac.abort();
  }, [workspace, reportOffline]);
  useVisiblePoll(loadQueue, QUEUE_POLL_MS, conn === 'online' && workspace ? `${workspace}/${reloadKey}` : null);

  // Keep deep-link params in the URL (see the header comment).
  useEffect(() => {
    if (conn !== 'online' || linkPending) return;
    const url = new URL(window.location.href);
    const set = (k: string, v: string | null | undefined) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
    url.searchParams.delete('workspace'); // alias of w
    set('w', workspace);
    set('tab', tab);
    set('peer', selectedPeer);
    set('session', session);
    set('message', focus?.id);
    set('at', focus?.created_at);
    set('q', query);
    if (url.href !== window.location.href) window.history.replaceState(null, '', url);
  }, [conn, linkPending, workspace, tab, selectedPeer, session, focus, query]);

  const changeWorkspace = useCallback((id: string) => {
    setWorkspace(id);
    setPeers([]);
    setSelectedPeer(null);
    setSession(null);
    setFocus(null);
    setQueue(null);
    setLinkNotice(null);
    if (urlInit.current) urlInit.current = {};
  }, []);

  const openSession = useCallback((id: string, f: MessageFocus | null = null) => {
    setSession(id);
    setFocus(f);
    setTab('sessions');
    setLinkNotice(null);
  }, []);
  const selectSession = useCallback((id: string) => {
    setSession(id);
    setFocus(null);
    setLinkNotice(null);
  }, []);

  const openMessage = useCallback(
    (m: HonchoMessage) => openSession(m.session_id, { id: m.id, created_at: m.created_at, query }),
    [openSession, query],
  );

  const submitSearch = useCallback(() => {
    const q = queryInput.trim();
    setQuery(q);
    if (q) setTab('search');
  }, [queryInput]);

  const copy = useCallback(
    async (text: string, what: string) => {
      const ok = await copyText(text);
      push(ok ? `Copied ${what}` : 'Clipboard blocked', { tone: ok ? 'success' : 'error' });
    },
    [push],
  );

  // Keyboard: / focus search · Esc blur/clear · 1–4 tabs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (document.activeElement === searchRef.current) {
          if (queryInput) setQueryInput('');
          else searchRef.current?.blur();
        } else if (queryInput || query) {
          setQueryInput('');
          setQuery('');
        } else if (focus) setFocus(null);
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (['1', '2', '3', '4'].includes(e.key) && conn === 'online') {
        setTab(TABS[Number(e.key) - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [queryInput, query, focus, conn]);

  const peer = useMemo(() => peers.find((p) => p.id === selectedPeer) ?? null, [peers, selectedPeer]);

  const searchBox = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submitSearch();
      }}
      className="flex items-center gap-2"
    >
      <label className="flex h-8 w-[min(40vw,480px)] items-center gap-2 rounded-full border border-subtle bg-panel-elevated px-3 focus-within:border-orange/60">
        <Search className="h-3.5 w-3.5 text-muted" />
        <input
          ref={searchRef}
          value={queryInput}
          onChange={(e) => {
            setQueryInput(e.target.value);
            if (!e.target.value) setQuery('');
          }}
          disabled={conn !== 'online'}
          placeholder="Search every message in Honcho — Enter to run  ( / )"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-paper placeholder:text-muted focus:outline-none disabled:opacity-50"
        />
        {queryInput && (
          <button
            type="button"
            onClick={() => {
              setQueryInput('');
              setQuery('');
            }}
            aria-label="Clear search"
            className="text-muted hover:text-paper"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>
    </form>
  );

  const right = (
    <>
      {conn === 'online' && (
        <button
          type="button"
          onClick={() => setAskOpen((v) => !v)}
          title="Toggle Ask Honcho"
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-full border px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
            askOpen ? 'border-orange/50 bg-orange/10 text-paper' : 'border-subtle bg-panel-elevated text-muted hover:text-paper',
          )}
        >
          <MessageCircleQuestion className="h-3.5 w-3.5" /> Ask
        </button>
      )}
      <span
        className={cn(
          'flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em]',
          conn === 'online' ? 'border-green/40 text-green' : conn === 'offline' ? 'border-[#EF4444]/40 text-[#F87171]' : 'border-subtle text-muted',
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', conn === 'online' ? 'bg-green' : conn === 'offline' ? 'bg-[#EF4444]' : 'bg-highlight')} />
        {conn}
      </span>
      <button
        type="button"
        onClick={() => (conn === 'online' ? setReloadKey((k) => k + 1) : void probe())}
        title="Refresh"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-subtle bg-panel-elevated text-muted hover:text-paper"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', (probing || peersLoading) && 'robo-spin')} />
      </button>
    </>
  );

  return (
    <HonchoOfflineContext.Provider value={reportOffline}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian">
        <AppTopBar accent="Honcho" subtitle="peer memory · self-hosted · local only" center={searchBox} right={right} />

        {conn === 'offline' ? (
          <HonchoOffline
            url={offlineUrl}
            error={offlineError}
            retrying={probing}
            secondsLeft={secondsLeft}
            onRetry={() => {
              setSecondsLeft(RETRY_SECONDS);
              void probe();
            }}
            onCopy={copy}
          />
        ) : conn === 'checking' ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex items-center gap-2 font-mono text-[11px] text-muted">
              <RefreshCw className="h-3.5 w-3.5 robo-spin" /> Connecting to Honcho…
            </div>
          </div>
        ) : (
          <div className="relative flex min-h-0 flex-1 max-md:flex-col max-md:overflow-y-auto">
            <HonchoRail
              status={status}
              queue={queue}
              workspaces={workspaces}
              workspace={workspace}
              onWorkspace={changeWorkspace}
              peers={peers}
              peersTotal={peersTotal}
              peersLoading={peersLoading}
              stats={stats}
              selectedPeer={selectedPeer}
              onPeer={(id) => {
                setSelectedPeer(id);
                if (tab === 'search' && !query) setTab('peers');
              }}
            />

            <main className="flex min-w-0 flex-1 flex-col max-md:min-h-[80dvh] max-md:shrink-0">
              <nav className="flex h-10 shrink-0 items-center gap-1 border-b border-subtle px-3 max-md:overflow-x-auto max-md:[scrollbar-width:none]">
                {TABS.map((t, i) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      'flex h-7 items-center gap-1.5 rounded-full px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
                      tab === t.id ? 'bg-orange/15 text-paper ring-1 ring-orange/40' : 'text-muted hover:text-paper',
                    )}
                  >
                    <t.icon className={cn('h-3.5 w-3.5', tab === t.id && 'text-orange')} />
                    {t.label}
                    <span className="text-[8.5px] text-muted">{i + 1}</span>
                  </button>
                ))}
                {workspace && <span className="ml-auto truncate font-mono text-[10px] text-muted">workspace · {workspace}</span>}
              </nav>

              {linkNotice && (
                <div role="status" className="flex shrink-0 items-start gap-2 border-b border-amber/30 bg-amber/10 px-4 py-1.5 text-[11px] leading-snug text-paper">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber" />
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{linkNotice}</span>
                  <button type="button" onClick={() => setLinkNotice(null)} aria-label="Dismiss notice" className="text-muted hover:text-paper">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {!workspace ? (
                <div className="flex flex-1 items-center justify-center text-[12px] text-muted">
                  {workspaces.length ? 'Select a workspace' : 'Honcho has no workspaces yet — agents create one when they first write memory.'}
                </div>
              ) : tab === 'peers' ? (
                <PeersTab
                  key={`${workspace}/${reloadKey}`}
                  workspace={workspace}
                  peer={peer}
                  peers={peers}
                  stats={stats}
                  onOpenSession={(id) => openSession(id)}
                  onCopy={copy}
                />
              ) : tab === 'sessions' && linkPending ? (
                <div className="flex flex-1 items-center justify-center gap-2 font-mono text-[11px] text-muted">
                  <Loader2 className="h-3.5 w-3.5 robo-spin" /> Opening the linked message…
                </div>
              ) : tab === 'sessions' ? (
                <SessionsTab
                  key={`${workspace}/${reloadKey}`}
                  workspace={workspace}
                  session={session}
                  focus={focus}
                  onSession={selectSession}
                  selfPeer={selectedPeer}
                  stats={stats}
                  onCopy={copy}
                />
              ) : tab === 'conclusions' ? (
                <ConclusionsTab
                  key={`${workspace}/${reloadKey}`}
                  workspace={workspace}
                  peers={peers}
                  selectedPeer={selectedPeer}
                  onOpenSession={(id) => openSession(id)}
                />
              ) : (
                <SearchTab
                  workspace={workspace}
                  query={query}
                  scope={searchScope}
                  onScope={setSearchScope}
                  peer={selectedPeer}
                  session={session}
                  onOpen={openMessage}
                />
              )}
            </main>

            {workspace && (
              <AskPanel
                key={workspace}
                workspace={workspace}
                peers={peers}
                selectedPeer={selectedPeer}
                session={session}
                onCopy={copy}
                onClose={() => setAskOpen(false)}
                className={cn(
                  !askOpen && 'hidden',
                  'max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-30 max-xl:bg-panel max-xl:shadow-[-16px_0_40px_rgba(0,0,0,0.5)]',
                  'max-md:fixed max-md:inset-x-0 max-md:top-[calc(3.5rem+env(safe-area-inset-top,0px))] max-md:bottom-[var(--mobile-tabbar-space)] max-md:z-40 max-md:w-full max-md:max-w-none max-md:border-l-0',
                )}
              />
            )}
          </div>
        )}

        <ToastStack toasts={toasts} onDismiss={dismiss} />
      </div>
    </HonchoOfflineContext.Provider>
  );
}
