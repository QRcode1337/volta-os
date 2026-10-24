'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, History, LoaderCircle, Search, Trash2, X } from 'lucide-react';
import type { SearchHit, SearchSourceId, SearchSourceResult } from '@/lib/server/search/types';
import { SEARCH_SOURCE_IDS } from '@/lib/server/search/types';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { isTypingTarget } from '@/lib/events';
import { AppTopBar } from '@/components/elements/kit/AppTopBar';
import { SEARCH_EVENTS } from './palette-events';
import { MIN_QUERY_CHARS, SOURCE_META, STATUS_META, clearRecent, loadRecent, openHit, pushRecent, useSearch, warmSearch } from './search-client';
import { SearchHitRow } from './SearchHitRow';

const PAGE_LIMIT = 20;
const MODE_LABEL: Record<SearchSourceResult['mode'], string> = {
  phrase: 'exact phrase',
  substring: 'all words',
  semantic: 'semantic',
  name: 'name match',
};
const isSourceId = (s: string): s is SearchSourceId => (SEARCH_SOURCE_IDS as string[]).includes(s);
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

function countLabel(s: SearchSourceResult): string {
  if (s.status === 'offline' || s.status === 'timeout' || s.status === 'error' || s.status === 'skipped') return STATUS_META[s.status].label;
  return s.total != null ? formatInt(s.total) : String(s.hits.length);
}

/** VOLTA Search — one query across LTM, Obsidian, claude-mem, Honcho, Notion, skills, routines and MCP servers. */
export function SearchApp() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState<SearchSourceId[]>([]); // empty = every source
  const [recent, setRecent] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // URL + localStorage are read after mount (hydration-safe).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setInput(sp.get('q') ?? '');
    setFilter((sp.get('sources') ?? '').split(',').filter(isSourceId));
    setRecent(loadRecent());
    warmSearch();
    inputRef.current?.focus();
  }, []);

  const { data, loading, error } = useSearch(input, { limit: PAGE_LIMIT });
  const query = norm(input);
  const current = !!data && data.q.toLowerCase() === query.slice(0, 200).toLowerCase();

  useEffect(() => {
    if (data) setNowMs(Date.now());
  }, [data]);

  // Keep ?q= and ?sources= shareable.
  useEffect(() => {
    const t = setTimeout(() => {
      const url = new URL(window.location.href);
      if (query) url.searchParams.set('q', query);
      else url.searchParams.delete('q');
      if (filter.length) url.searchParams.set('sources', filter.join(','));
      else url.searchParams.delete('sources');
      if (url.href !== window.location.href) window.history.replaceState(null, '', url);
    }, 300);
    return () => clearTimeout(t);
  }, [query, filter]);

  // A query that stayed on screen with its results for 2.5 s counts as a search worth remembering.
  useEffect(() => {
    if (!current || loading || !data?.sources.some((s) => s.hits.length)) return;
    const t = setTimeout(() => setRecent(pushRecent(query)), 2500);
    return () => clearTimeout(t);
  }, [current, loading, data, query]);

  const sources = useMemo(() => data?.sources ?? [], [data]);
  const visible = useMemo(() => sources.filter((s) => !filter.length || filter.includes(s.source)), [sources, filter]);
  const withHits = useMemo(() => visible.filter((s) => s.hits.length), [visible]);
  const flat = useMemo(() => withHits.flatMap((s) => s.hits), [withHits]);
  const quiet = useMemo(() => visible.filter((s) => !s.hits.length), [visible]);

  useEffect(() => setActive(0), [data, filter]);
  useEffect(() => {
    document.getElementById(`search-hit-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const opened = useCallback(() => setRecent(pushRecent(query)), [query]);

  const open = useCallback(
    (hit: SearchHit | undefined, secondary: boolean) => {
      if (!hit) return;
      if (openHit(hit, router, secondary)) opened();
    },
    [router, opened],
  );

  // "/" or ⌘K (bridged from the palette) focuses the box; ↑/↓ from anywhere outside a field moves the selection.
  useEffect(() => {
    const focus = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === '/') {
        e.preventDefault();
        focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        inputRef.current?.focus();
        setActive((a) => (e.key === 'ArrowDown' ? Math.min(a + 1, Math.max(flat.length - 1, 0)) : Math.max(a - 1, 0)));
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(SEARCH_EVENTS.focusPage, focus);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(SEARCH_EVENTS.focusPage, focus);
    };
  }, [flat.length]);

  const onInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (current && flat[active]) open(flat[active], e.metaKey || e.ctrlKey);
      else if (query.length >= MIN_QUERY_CHARS) setRecent(pushRecent(query));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (input) setInput('');
      else inputRef.current?.blur();
    }
  };

  const toggle = (id: SearchSourceId) => setFilter((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  const totalHits = sources.reduce((n, s) => n + s.hits.length, 0);
  const statusLine = data
    ? `${sources.filter((s) => s.status === 'ok' || s.status === 'partial').length}/${sources.length} sources answered · ${formatInt(data.tookMs)} ms`
    : null;

  let index = -1;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian">
      <AppTopBar
        accent="Search"
        subtitle="every memory source · read-only · local only"
        right={
          <span className="hidden items-center gap-2 font-mono text-[10px] text-muted sm:flex">
            {loading && <LoaderCircle className="h-3.5 w-3.5 robo-spin text-orange" />}
            {statusLine}
          </span>
        }
      />

      <div className="hud-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 pb-16 pt-6">
          {/* Search box */}
          <label className="flex h-14 items-center gap-3 rounded-2xl border border-subtle bg-panel px-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] focus-within:border-orange/60">
            {loading ? <LoaderCircle className="h-5 w-5 shrink-0 robo-spin text-orange" /> : <Search className="h-5 w-5 shrink-0 text-muted" />}
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="Search LTM, notes, claude-mem, Honcho, Notion, skills, routines…"
              aria-label="Search every memory source"
              aria-controls="search-results"
              aria-activedescendant={flat.length ? `search-hit-${active}` : undefined}
              role="combobox"
              aria-expanded={flat.length > 0}
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-[17px] text-paper placeholder:text-muted focus:outline-none"
            />
            {input && (
              <button type="button" onClick={() => setInput('')} aria-label="Clear search" className="text-muted hover:text-paper">
                <X className="h-4 w-4" />
              </button>
            )}
            <kbd className="hidden rounded-md border border-highlight bg-panel-hover px-1.5 py-0.5 font-mono text-[10px] text-muted sm:inline">⌘K</kbd>
          </label>

          {/* Source chips */}
          {query.length >= MIN_QUERY_CHARS && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by source">
              <button
                type="button"
                onClick={() => setFilter([])}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-full border px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
                  !filter.length ? 'border-orange/50 bg-orange/10 text-paper' : 'border-subtle text-muted hover:text-paper',
                )}
              >
                All <span className="text-secondary">{data ? formatInt(totalHits) : '…'}</span>
              </button>
              {SEARCH_SOURCE_IDS.map((id) => {
                const s = sources.find((x) => x.source === id) ?? null;
                const meta = SOURCE_META[id];
                const on = filter.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggle(id)}
                    aria-pressed={on}
                    title={s ? `${s.label} · ${s.status} · ${formatInt(s.ms)} ms${s.note ? `\n${s.note}` : ''}` : meta.label}
                    className={cn(
                      'flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors',
                      on ? 'border-orange/50 bg-orange/10 text-paper' : 'border-subtle text-secondary hover:border-highlight hover:text-paper',
                      s && !s.hits.length && !on && 'opacity-60',
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', s ? STATUS_META[s.status].dot : 'bg-highlight robo-pulse')} />
                    <meta.icon className="h-3 w-3" style={{ color: meta.color }} aria-hidden />
                    {meta.short}
                    <span className={cn(s && s.status !== 'ok' && s.status !== 'partial' ? STATUS_META[s.status].text : 'text-muted')}>{s ? countLabel(s) : '…'}</span>
                  </button>
                );
              })}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-[12px] text-[#F87171]">
              <CircleAlert className="h-4 w-4" /> Search failed: {error}
            </div>
          )}

          {/* Empty query: recent searches + what is searched */}
          {query.length < MIN_QUERY_CHARS && (
            <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
              <section className="hud-card p-4">
                <header className="mb-2 flex items-center gap-2">
                  <History className="h-3.5 w-3.5 text-orange" />
                  <h2 className="hud-label">Recent searches</h2>
                  {recent.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        clearRecent();
                        setRecent([]);
                      }}
                      className="ml-auto flex items-center gap-1 font-mono text-[10px] text-muted hover:text-paper"
                    >
                      <Trash2 className="h-3 w-3" /> clear
                    </button>
                  )}
                </header>
                {recent.length ? (
                  <ul className="flex flex-col gap-1">
                    {recent.map((r) => (
                      <li key={r}>
                        <button
                          type="button"
                          onClick={() => {
                            setInput(r);
                            inputRef.current?.focus();
                          }}
                          className="w-full truncate rounded-md px-2 py-1.5 text-left text-[13px] text-secondary hover:bg-panel-hover hover:text-paper"
                        >
                          {r}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-muted">Nothing yet — searches you open or linger on are kept in this browser only.</p>
                )}
              </section>
              <section className="hud-card p-4">
                <h2 className="hud-label mb-2">What gets searched</h2>
                <ul className="flex flex-col gap-1.5 text-[12px] text-secondary">
                  {SEARCH_SOURCE_IDS.map((id) => {
                    const m = SOURCE_META[id];
                    return (
                      <li key={id} className="flex items-start gap-2">
                        <m.icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: m.color }} aria-hidden />
                        <span>
                          <span className="text-paper">{m.label}</span> — {SOURCE_HELP[id]}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 font-mono text-[10px] text-muted">↑/↓ select · Enter open · ⌘Enter secondary link · Esc clear · ⌘K anywhere</p>
              </section>
            </div>
          )}

          {/* Results */}
          {query.length >= MIN_QUERY_CHARS && data && (
            <div id="search-results" role="listbox" aria-label="Search results" className={cn('flex flex-col gap-5 transition-opacity', !current && 'opacity-60')}>
              {withHits.map((s) => {
                const meta = SOURCE_META[s.source];
                return (
                  <section key={s.source} aria-label={s.label}>
                    <header className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-1">
                      <meta.icon className="h-3.5 w-3.5 translate-y-0.5" style={{ color: meta.color }} aria-hidden />
                      <h2 className="hud-label text-paper">{s.label}</h2>
                      <span className="rounded-full border border-subtle px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.06em] text-muted">{MODE_LABEL[s.mode]}</span>
                      <span className="font-mono text-[10px] text-secondary">
                        {s.total != null
                          ? `${formatInt(s.total)} match${s.total === 1 ? '' : 'es'}${s.total > s.hits.length ? ` · top ${s.hits.length}` : ''}`
                          : `top ${s.hits.length}`}
                      </span>
                      {s.status !== 'ok' && <span className={cn('font-mono text-[10px]', STATUS_META[s.status].text)}>{s.status}</span>}
                      <span className="ml-auto font-mono text-[10px] text-muted">{formatInt(s.ms)} ms</span>
                    </header>
                    {s.note && <p className="mb-1 px-1 font-mono text-[10px] leading-snug text-muted [overflow-wrap:anywhere]">{s.note}</p>}
                    <div className="flex flex-col gap-0.5">
                      {s.hits.map((h) => {
                        index++;
                        const i = index;
                        return (
                          <SearchHitRow
                            key={h.id}
                            domId={`search-hit-${i}`}
                            hit={h}
                            active={i === active}
                            nowMs={nowMs}
                            router={router}
                            onHover={() => setActive(i)}
                            onOpened={opened}
                          />
                        );
                      })}
                    </div>
                  </section>
                );
              })}

              {current && !flat.length && !loading && (
                <div className="hud-card px-4 py-6 text-center text-[13px] text-secondary">
                  No matches for <span className="text-paper">“{query}”</span>
                  {filter.length ? ' in the selected sources' : ''}.
                </div>
              )}

              {quiet.length > 0 && (
                <section className="hud-card px-4 py-3">
                  <h2 className="hud-label mb-1.5">No results from</h2>
                  <ul className="flex flex-col gap-1">
                    {quiet.map((s) => {
                      const meta = SOURCE_META[s.source];
                      return (
                        <li key={s.source} className="flex items-baseline gap-2 text-[12px]">
                          <span className={cn('h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full', STATUS_META[s.status].dot)} />
                          <span className="shrink-0 text-paper">{meta.label}</span>
                          <span className={cn('shrink-0 font-mono text-[10px]', STATUS_META[s.status].text)}>
                            {s.status === 'ok' ? 'no matches' : s.status}
                          </span>
                          {s.note && <span className="min-w-0 truncate font-mono text-[10px] text-muted" title={s.note}>{s.note}</span>}
                          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">{formatInt(s.ms)} ms</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
          )}

          {query.length >= MIN_QUERY_CHARS && !data && loading && (
            <div className="flex items-center justify-center gap-2 py-10 font-mono text-[11px] text-muted">
              <LoaderCircle className="h-4 w-4 robo-spin" /> Searching 8 sources…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const SOURCE_HELP: Record<SearchSourceId, string> = {
  ltm: 'screen OCR + window titles (exact phrase), opens the capture in VOLTA LTM',
  notes: 'titles, paths and text of the Obsidian vaults (every word must appear)',
  'claude-mem': 'observations + session summaries via the worker’s semantic search (3+ characters)',
  honcho: 'message search (semantic, 3+ characters) plus peer and session ids',
  notion: 'Notion page titles seen in LTM window titles',
  skills: 'installed skill names and descriptions',
  routines: 'OpenClaw cron jobs and LaunchAgents by name and schedule',
  mcp: 'MCP server names from ~/.claude.json',
};
