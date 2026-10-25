'use client';
// VOLTA Feeds: a reader for what the agent cron jobs produced (OpenClaw/ErisMorn jobs, memory logs, Hermes briefings).
// Left: sources with unread counts. Centre: item list with triage badges. Right: the rendered item.
// Data comes from /api/feeds (read-only over the job stores, masked server-side); "read" marks persist on the Windsor drive.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, CheckCheck, Copy, Inbox, Loader2, RefreshCw, Search, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AppTopBar } from '@/components/elements/kit/AppTopBar';
import { ToastStack, useToasts } from '@/components/elements/kit/toast';
import { copyText } from '@/components/elements/kit/clipboard';
import { MarkdownView } from '@/components/notion/MarkdownView';
import { STATUS_LABEL, ago, fetchItem, fetchList, fmtDuration, fullDate, postRead, type FeedItem, type FeedListItem, type FeedListResponse, type FeedQuery } from './feeds-client';
import { ItemRow, StatusDot, TriageBadge } from './parts';

const PAGE = 40;
const POLL_MS = 60_000;
const GROUP_ORDER = ['OpenClaw cron', 'ErisMorn memory', 'OpenClaw health', 'Hermes'];

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

export function FeedsApp() {
  const { toasts, push, dismiss } = useToasts();
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [needsAction, setNeedsAction] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState<FeedListItem[]>([]);
  const [meta, setMeta] = useState<Omit<FeedListResponse, 'items'> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FeedItem | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [confirmAll, setConfirmAll] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const warnedPersist = useRef(false);
  const itemsRef = useRef<FeedListItem[]>([]);
  itemsRef.current = items;

  const query = useMemo<FeedQuery>(() => ({ source, q, needsAction, unread: unreadOnly }), [source, q, needsAction, unreadOnly]);
  const queryRef = useRef(query);
  queryRef.current = query;

  // debounce the search box
  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput), 250);
    return () => window.clearTimeout(t);
  }, [qInput]);

  const apply = useCallback((res: FeedListResponse, append: boolean) => {
    const { items: page, ...rest } = res;
    setMeta(rest);
    setItems((prev) => {
      if (!append) return page;
      const seen = new Set(prev.map((i) => i.id));
      return [...prev, ...page.filter((i) => !seen.has(i.id))];
    });
  }, []);

  /** Reload the list. `keep` re-fetches as many rows as are on screen (used by the poll) without resetting scroll. */
  const reload = useCallback(
    async (opts: { refresh?: boolean; keep?: boolean; quiet?: boolean } = {}) => {
      if (!opts.quiet) setLoading(true);
      try {
        const limit = opts.keep ? Math.min(100, Math.max(PAGE, itemsRef.current.length)) : PAGE;
        const res = await fetchList(queryRef.current, { limit, refresh: opts.refresh });
        apply(res, false);
        setNow(Date.now());
        setError(null);
        if (!res.readStore.persisted && !warnedPersist.current) {
          warnedPersist.current = true;
          push(res.readStore.reason ? `Read marks are not being saved: ${res.readStore.reason}.` : 'Read marks are not being saved.', { tone: 'error', ttl: 9000 });
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
        setLoaded(true);
      }
    },
    [apply, push],
  );

  // filters changed -> fresh first page
  useEffect(() => {
    void reload();
  }, [query, reload]);

  // poll every 60 s while the tab is visible; catch up when it becomes visible again
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void reload({ keep: true, quiet: true });
    };
    const t = window.setInterval(tick, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reload]);

  const loadMore = useCallback(async () => {
    const cursor = meta?.nextCursor;
    if (!cursor || moreLoading) return;
    setMoreLoading(true);
    try {
      apply(await fetchList(queryRef.current, { cursor, limit: PAGE }), true);
    } catch (err) {
      push((err as Error).message, { tone: 'error' });
    } finally {
      setMoreLoading(false);
    }
  }, [meta?.nextCursor, moreLoading, apply, push]);

  // infinite scroll sentinel
  const sentinel = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !meta?.nextCursor) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && void loadMore(), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [meta?.nextCursor, loadMore, items.length]);

  // ── selection + detail ──
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    const ac = new AbortController();
    setDetailError(null);
    fetchItem(selectedId, ac.signal)
      .then((d) => setDetail(d))
      .catch((err: Error) => {
        if (ac.signal.aborted) return;
        setDetail(null);
        setDetailError(err.message);
      });
    return () => ac.abort();
  }, [selectedId]);

  // ── read marks (optimistic, reverted on failure) ──
  const setRead = useCallback(
    async (ids: string[], read: boolean) => {
      const idSet = new Set(ids);
      const touched = itemsRef.current.filter((i) => idSet.has(i.id) && i.read !== read);
      if (!touched.length) return;
      const delta = read ? -1 : 1;
      const patchMeta = (sign: number) =>
        setMeta((m) =>
          m
            ? {
                ...m,
                totals: { ...m.totals, unread: Math.max(0, m.totals.unread + sign * delta * touched.length) },
                sources: m.sources.map((s) => {
                  const n = touched.filter((t) => t.source === s.id);
                  if (!n.length) return s;
                  const na = n.filter((t) => t.triage === 'needs-action').length;
                  return { ...s, unread: Math.max(0, s.unread + sign * delta * n.length), needsAction: Math.max(0, s.needsAction + sign * delta * na) };
                }),
              }
            : m,
        );
      const flag = (value: boolean) => setItems((prev) => prev.map((i) => (idSet.has(i.id) ? { ...i, read: value } : i)));
      flag(read);
      patchMeta(1);
      setDetail((d) => (d && idSet.has(d.id) ? { ...d, read } : d));
      try {
        const res = await postRead({ ids, read });
        if (!res.persisted && !warnedPersist.current) {
          warnedPersist.current = true;
          push(res.reason ?? 'Read marks could not be saved to the Windsor drive.', { tone: 'error', ttl: 9000 });
        }
      } catch (err) {
        flag(!read);
        patchMeta(-1);
        setDetail((d) => (d && idSet.has(d.id) ? { ...d, read: !read } : d));
        push((err as Error).message, { tone: 'error' });
      }
    },
    [push],
  );

  // opening an unread item marks it read after a short dwell
  useEffect(() => {
    if (!detail || detail.read) return;
    const id = detail.id;
    const t = window.setTimeout(() => void setRead([id], true), 900);
    return () => window.clearTimeout(t);
  }, [detail, setRead]);

  const markAll = useCallback(async () => {
    if (!confirmAll) {
      setConfirmAll(true);
      window.setTimeout(() => setConfirmAll(false), 3500);
      return;
    }
    setConfirmAll(false);
    try {
      const res = await postRead(queryRef.current.source ? { source: queryRef.current.source } : { all: true });
      push(`Marked ${res.changed} item${res.changed === 1 ? '' : 's'} read.`, { tone: 'success' });
      if (!res.persisted) push(res.reason ?? 'Not saved to the Windsor drive.', { tone: 'error', ttl: 9000 });
      await reload({ keep: true, quiet: true });
    } catch (err) {
      push((err as Error).message, { tone: 'error' });
    }
  }, [confirmAll, push, reload]);

  const select = useCallback((id: string) => setSelectedId(id), []);

  // keyboard: j/k move, m toggles read, / searches, Esc closes the item on small screens
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/' && !isTyping(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (isTyping(e.target)) return;
      const list = itemsRef.current;
      const idx = list.findIndex((i) => i.id === selectedId);
      if (e.key === 'j' || e.key === 'k') {
        const next = list[Math.min(list.length - 1, Math.max(0, idx + (e.key === 'j' ? 1 : -1)))];
        if (next) {
          setSelectedId(next.id);
          document.querySelector(`[data-item-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'm' && idx >= 0) {
        void setRead([list[idx].id], !list[idx].read);
      } else if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, setRead]);

  const sources = meta?.sources;
  const grouped = useMemo(() => {
    const m = new Map<string, NonNullable<typeof sources>>();
    for (const s of sources ?? []) m.set(s.group, [...(m.get(s.group) ?? []), s]);
    return [...m.entries()].sort((a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]));
  }, [sources]);
  const activeSource = sources?.find((s) => s.id === source);
  const jev = meta?.jev;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-paper">
      <AppTopBar
        accent="Feeds"
        subtitle="Agent cron outputs · OpenClaw · ErisMorn · Hermes"
        right={
          <>
            {jev?.enabled && (
              <span
                className="hud-label hidden items-center gap-1.5 md:inline-flex"
                title={jev.circuitOpen ? 'JEV is unreachable right now; triage resumes automatically.' : `${jev.triaged} items triaged by JEV${jev.pending ? `, ${jev.pending} waiting` : ''}`}
              >
                <Sparkles className={cn('h-3 w-3', jev.circuitOpen ? 'text-amber' : 'text-purple')} />
                JEV {jev.circuitOpen ? 'paused' : jev.pending ? `${jev.pending} pending` : 'on'}
              </span>
            )}
            {meta && (
              <span className="hud-label hidden lg:inline">
                <span className="text-orange">{meta.totals.unread}</span> unread
                {meta.totals.needsAction > 0 && (
                  <>
                    {' · '}
                    <span className="text-amber">{meta.totals.needsAction}</span> need action
                  </>
                )}
              </span>
            )}
            {meta && (
              <span className="hud-label hidden xl:inline" title={`Refreshed ${new Date(meta.refreshedAt).toLocaleTimeString()}; polls every 60 s while this tab is visible`}>
                {ago(meta.refreshedAt, now) === 'now' ? 'just now' : `${ago(meta.refreshedAt, now)} ago`}
              </span>
            )}
            <button
              type="button"
              onClick={() => void reload({ refresh: true })}
              aria-label="Refresh"
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-subtle px-3 font-mono text-[10px] uppercase tracking-[0.06em] text-muted hover:text-paper"
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} /> Refresh
            </button>
          </>
        }
      />

      {meta && meta.warnings.length > 0 && <p className="shrink-0 border-b border-amber/40 bg-amber/5 px-4 py-1.5 font-mono text-[10.5px] text-amber">{meta.warnings.join(' · ')}</p>}

      <div className="flex min-h-0 flex-1">
        {/* ── sources ── */}
        <aside className="hud-scroll hidden w-64 shrink-0 overflow-y-auto border-r border-subtle bg-panel md:block" aria-label="Sources">
          <button
            type="button"
            onClick={() => setSource(null)}
            className={cn('flex w-full items-center gap-2 border-b border-subtle px-4 py-3 text-left text-[13px] font-medium', source === null ? 'bg-panel-elevated text-paper' : 'text-secondary hover:text-paper')}
          >
            <Inbox className="h-3.5 w-3.5 text-orange" />
            All feeds
            <Count n={meta?.totals.unread ?? 0} />
          </button>
          {grouped.map(([group, list]) => (
            <div key={group}>
              <p className="px-4 pb-1 pt-4 font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted">{group}</p>
              {list.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSource(s.id === source ? null : s.id)}
                  aria-pressed={s.id === source}
                  title={s.lastAt ? `Last output ${fullDate(s.lastAt)} · ${s.total} retained` : undefined}
                  className={cn('flex w-full items-center gap-2 px-4 py-1.5 text-left text-[12.5px] transition-colors', s.id === source ? 'bg-panel-elevated text-paper' : 'text-secondary hover:bg-panel-hover/50 hover:text-paper')}
                >
                  <StatusDot status={s.lastStatus} />
                  <span className={cn('min-w-0 flex-1 truncate', s.unread > 0 && 'font-medium text-paper')}>{s.label}</span>
                  {s.needsAction > 0 && (
                    <span className="rounded-full bg-amber/15 px-1.5 font-mono text-[9.5px] font-semibold text-amber" title={`${s.needsAction} unread need action`}>
                      !{s.needsAction}
                    </span>
                  )}
                  <Count n={s.unread} />
                </button>
              ))}
            </div>
          ))}
          {meta && (
            <p className="px-4 pb-6 pt-5 font-mono text-[9.5px] leading-relaxed text-muted" title={meta.readStore.path}>
              Read marks: {meta.readStore.persisted ? 'saved on Windsor' : 'session only (Windsor not available)'}
            </p>
          )}
        </aside>

        {/* ── list ── */}
        <section className={cn('min-h-0 w-full flex-col border-r border-subtle lg:w-[430px] lg:shrink-0 xl:w-[480px]', selectedId ? 'hidden lg:flex' : 'flex')} aria-label="Items">
          <div className="shrink-0 space-y-2 border-b border-subtle px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search feeds  ( / )"
                aria-label="Search feeds"
                className="h-9 w-full rounded-full border border-subtle bg-panel pl-9 pr-8 text-[13px] text-paper placeholder:text-muted focus:border-orange focus:outline-none"
              />
              {qInput && (
                <button type="button" aria-label="Clear search" onClick={() => setQInput('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-paper">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                aria-label="Source"
                value={source ?? ''}
                onChange={(e) => setSource(e.target.value || null)}
                className="h-8 max-w-[150px] rounded-full border border-subtle bg-panel px-3 text-[12px] text-secondary md:hidden"
              >
                <option value="">All feeds</option>
                {(sources ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <Chip active={needsAction} onClick={() => setNeedsAction((v) => !v)} tone="amber">
                Needs action
              </Chip>
              <Chip active={unreadOnly} onClick={() => setUnreadOnly((v) => !v)} tone="orange">
                Unread
              </Chip>
              {source && activeSource && (
                <button type="button" onClick={() => setSource(null)} className="inline-flex h-8 items-center gap-1 rounded-full border border-orange bg-orange/10 px-3 text-[12px] font-medium text-paper">
                  {activeSource.label} <X className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => void markAll()}
                className={cn('ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium', confirmAll ? 'border-orange bg-orange/10 text-paper' : 'border-transparent text-secondary hover:border-subtle hover:text-paper')}
                title={activeSource ? `Mark every ${activeSource.label} item read` : 'Mark every item read'}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {confirmAll ? 'Confirm?' : 'Mark all read'}
              </button>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted">
              {meta ? `${meta.matched} item${meta.matched === 1 ? '' : 's'}` : 'Loading'}
              {q && ` matching "${q}"`}
            </p>
          </div>

          <div className="hud-scroll min-h-0 flex-1 overflow-y-auto">
            {error && <p className="m-4 rounded-md border border-[#EF4444]/40 bg-[#EF4444]/5 px-3 py-2 font-mono text-[11px] text-[#EF4444]">Could not load feeds: {error}</p>}
            {!loaded && !error && (
              <p className="flex items-center gap-2 px-4 py-6 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading job outputs...
              </p>
            )}
            {loaded && !error && items.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                <p className="font-doto text-4xl text-orange">0</p>
                <p className="text-secondary">{needsAction || unreadOnly || q || source ? 'Nothing matches these filters.' : 'No job outputs found.'}</p>
              </div>
            )}
            <ul>
              {items.map((it) => (
                <ItemRow key={it.id} it={it} active={it.id === selectedId} now={now} onSelect={select} />
              ))}
              {meta?.nextCursor && (
                <li ref={sentinel} className="flex justify-center px-4 py-4">
                  <button type="button" onClick={() => void loadMore()} className="inline-flex h-8 items-center gap-2 rounded-full border border-subtle px-4 font-mono text-[10px] uppercase tracking-[0.06em] text-muted hover:text-paper">
                    {moreLoading && <Loader2 className="h-3 w-3 animate-spin" />} Load older
                  </button>
                </li>
              )}
            </ul>
          </div>
        </section>

        {/* ── reader ── */}
        <article className={cn('hud-scroll min-h-0 min-w-0 flex-1 overflow-y-auto bg-obsidian', selectedId ? 'block' : 'hidden lg:block')} aria-label="Item">
          {!selectedId && (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="font-doto text-4xl text-orange">&gt;_</p>
              <p className="text-secondary">Select an item to read it.</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">j / k move · m mark read · / search</p>
            </div>
          )}
          {selectedId && detailError && <p className="m-6 rounded-md border border-[#EF4444]/40 bg-[#EF4444]/5 px-3 py-2 font-mono text-[11px] text-[#EF4444]">{detailError}</p>}
          {selectedId && !detail && !detailError && (
            <p className="flex items-center gap-2 px-6 py-8 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
            </p>
          )}
          {detail && (
            <Reader
              item={detail}
              onBack={() => setSelectedId(null)}
              onToggleRead={() => void setRead([detail.id], !detail.read)}
              onCopy={async () => push((await copyText(detail.link ?? '')) ? 'Path copied.' : 'Copy failed.', { tone: 'success' })}
            />
          )}
        </article>
      </div>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function Count({ n }: { n: number }) {
  if (n <= 0) return <span className="w-6" />;
  return <span className="ml-auto min-w-[1.5rem] rounded-full bg-orange/15 px-1.5 text-center font-mono text-[10px] font-semibold text-orange">{n > 999 ? '999+' : n}</span>;
}

function Chip({ active, onClick, tone, children }: { active: boolean; onClick: () => void; tone: 'amber' | 'orange'; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors',
        active ? (tone === 'amber' ? 'border-amber bg-amber/10 text-paper' : 'border-orange bg-orange/10 text-paper') : 'border-transparent text-secondary hover:border-subtle hover:text-paper',
      )}
    >
      {active && <Check className="h-3 w-3" />}
      {children}
    </button>
  );
}

function Reader({ item, onBack, onToggleRead, onCopy }: { item: FeedItem; onBack: () => void; onToggleRead: () => void; onCopy: () => void }) {
  const dur = fmtDuration(item.durationMs);
  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-5">
      <button type="button" onClick={onBack} className="mb-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-subtle px-3 font-mono text-[10px] uppercase tracking-[0.06em] text-muted hover:text-paper lg:hidden">
        <ArrowLeft className="h-3 w-3" /> Back
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <StatusDot status={item.status} />
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
          {item.sourceLabel} · {STATUS_LABEL[item.status]}
        </span>
        <TriageBadge triage={item.triage} by={item.triageBy} confidence={item.triageConfidence} />
        <button
          type="button"
          onClick={onToggleRead}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-subtle px-3 text-[12px] font-medium text-secondary hover:border-highlight hover:text-paper"
        >
          <Check className="h-3.5 w-3.5" /> {item.read ? 'Mark unread' : 'Mark read'}
        </button>
      </div>
      <h1 className="mt-3 text-[20px] font-semibold leading-snug tracking-tight text-paper">{item.title}</h1>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
        <dt>Ran</dt>
        <dd className="text-secondary">{fullDate(item.ranAt)}</dd>
        <dt>Job</dt>
        <dd className="truncate text-secondary">
          {item.job}
          {item.agent ? ` · agent ${item.agent}` : ''}
        </dd>
        {item.delivery && (
          <>
            <dt>Delivery</dt>
            <dd className="text-secondary">{item.delivery}</dd>
          </>
        )}
        {(dur || item.model) && (
          <>
            <dt>Run</dt>
            <dd className="text-secondary">{[dur, item.model].filter(Boolean).join(' · ')}</dd>
          </>
        )}
        {item.link && (
          <>
            <dt>Source</dt>
            <dd className="flex min-w-0 items-center gap-2 text-secondary">
              <span className="truncate" title={item.link}>
                {item.link}
              </span>
              <button type="button" onClick={onCopy} aria-label="Copy path" className="shrink-0 text-muted hover:text-paper">
                <Copy className="h-3 w-3" />
              </button>
            </dd>
          </>
        )}
      </dl>
      <div className="my-5 border-t border-subtle" />
      <MarkdownView md={item.body} />
    </div>
  );
}

export default FeedsApp;
