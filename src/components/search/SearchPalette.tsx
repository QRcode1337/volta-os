'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight, History, LoaderCircle, Search } from 'lucide-react';
import type { SearchHit } from '@/lib/server/search/types';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { OS_EVENTS } from '@/lib/events';
import { SEARCH_EVENTS, isPaletteShortcut } from './palette-events';
import { MIN_QUERY_CHARS, SOURCE_META, STATUS_META, loadRecent, openHit, openHref, pushRecent, useSearch, warmSearch } from './search-client';
import { SearchHitRow } from './SearchHitRow';

const PALETTE_LIMIT = 4;
const SEARCH_PAGE = '/apps/search';

type Item = { kind: 'hit'; hit: SearchHit } | { kind: 'all' } | { kind: 'recent'; q: string };

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Global ⌘K / Ctrl+K command palette (mounted once in the root layout). Top hits per source, keyboard-first:
 * ↑/↓ select · Enter open · ⌘Enter secondary link · Esc close · last row "See all results" → /apps/search?q=.
 * On /apps/search itself, ⌘K focuses that page's box instead of stacking a palette on top.
 */
export function SearchPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const openRef = useRef(false);
  const pathRef = useRef(pathname);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const show = useCallback((q?: string) => {
    if (!openRef.current) restoreRef.current = document.activeElement as HTMLElement | null;
    if (q != null) setInput(q);
    setRecent(loadRecent());
    openRef.current = true;
    setOpen(true);
    warmSearch();
  }, []);

  const close = useCallback(() => {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    const el = restoreRef.current;
    restoreRef.current = null;
    if (el && document.contains(el)) el.focus?.();
  }, []);

  // ⌘K / Ctrl+K anywhere; openSearchPalette() from any component; the OS-wide Esc event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPaletteShortcut(e)) return;
      e.preventDefault();
      if (pathRef.current === SEARCH_PAGE) {
        close();
        window.dispatchEvent(new CustomEvent(SEARCH_EVENTS.focusPage));
      } else if (openRef.current) close();
      else show();
    };
    const onOpen = (e: Event) => show((e as CustomEvent<{ q?: string }>).detail?.q);
    window.addEventListener('keydown', onKey);
    window.addEventListener(SEARCH_EVENTS.open, onOpen);
    window.addEventListener(OS_EVENTS.escape, close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(SEARCH_EVENTS.open, onOpen);
      window.removeEventListener(OS_EVENTS.escape, close);
    };
  }, [show, close]);

  // Esc closes the palette wherever focus is (GlobalShortcuts, which sends OS_EVENTS.escape, is mounted on the home page only).
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  }, [open, close]);

  // Navigating away (a result was opened) closes the palette.
  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  const { data, loading } = useSearch(input, { limit: PALETTE_LIMIT, enabled: open });
  const query = norm(input);
  const current = !!data && data.q.toLowerCase() === query.slice(0, 200).toLowerCase();

  useEffect(() => {
    if (data) setNowMs(Date.now());
  }, [data]);

  const groups = useMemo(() => (data?.sources ?? []).filter((s) => s.hits.length), [data]);
  const items = useMemo<Item[]>(() => {
    if (query.length < MIN_QUERY_CHARS) return recent.map((q) => ({ kind: 'recent', q }));
    return [...groups.flatMap((s) => s.hits.map((hit): Item => ({ kind: 'hit', hit }))), { kind: 'all' }];
  }, [query, recent, groups]);

  useEffect(() => setActive(0), [items]);
  useEffect(() => {
    if (open) document.getElementById(`palette-item-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const seeAll = useCallback(() => {
    pushRecent(query);
    openHref(`${SEARCH_PAGE}?${new URLSearchParams({ q: query })}`, false, router);
    close();
  }, [query, router, close]);

  const choose = (item: Item | undefined, secondary: boolean) => {
    if (!item) return;
    if (item.kind === 'recent') {
      setInput(item.q);
      return;
    }
    if (item.kind === 'all') {
      seeAll();
      return;
    }
    if (openHit(item.hit, router, secondary)) {
      pushRecent(query);
      close();
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Results on screen still belong to an older query (typing outran the debounce): go to the full page.
      if (query.length >= MIN_QUERY_CHARS && !current) seeAll();
      else choose(items[active], e.metaKey || e.ctrlKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      e.preventDefault(); // focus stays in the palette
    }
  };

  if (!mounted || !open) return null;

  let index = -1;
  const sources = data?.sources ?? [];

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center bg-obsidian/70 px-4 pt-[10vh] backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search every memory source"
        // Clicks on non-interactive parts must not move focus to <body>, where keys would reach the page behind.
        onMouseDown={(e) => {
          if (!(e.target as HTMLElement).closest('input,button,a,[role="option"]')) e.preventDefault();
        }}
        className="hud-card flex max-h-[min(72vh,720px)] w-full max-w-2xl flex-col overflow-hidden shadow-[0_0_0_1px_var(--border-subtle),0_24px_80px_rgba(0,0,0,0.65)]"
      >
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-subtle px-4">
          {loading ? <LoaderCircle className="h-4 w-4 shrink-0 robo-spin text-orange" /> : <Search className="h-4 w-4 shrink-0 text-muted" />}
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search LTM, notes, claude-mem, Honcho, Notion, skills…"
            aria-label="Search every memory source"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="palette-results"
            aria-activedescendant={items.length ? `palette-item-${active}` : undefined}
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-paper placeholder:text-muted focus:outline-none"
          />
          <kbd className="rounded-md border border-highlight bg-panel-hover px-1.5 py-0.5 font-mono text-[10px] text-muted">Esc</kbd>
        </div>

        <div id="palette-results" role="listbox" aria-label="Results" className={cn('hud-scroll min-h-0 flex-1 overflow-y-auto p-2', !current && query.length >= MIN_QUERY_CHARS && 'opacity-70')}>
          {query.length < MIN_QUERY_CHARS ? (
            recent.length ? (
              <>
                <p className="hud-label px-2 pb-1 pt-1">Recent searches</p>
                {recent.map((r) => {
                  index++;
                  const i = index;
                  return (
                    <div
                      key={r}
                      id={`palette-item-${i}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseMove={() => setActive(i)}
                      onClick={() => choose({ kind: 'recent', q: r }, false)}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] text-secondary',
                        i === active ? 'border-orange/45 bg-orange/[0.07] text-paper' : 'border-transparent',
                      )}
                    >
                      <History className="h-3.5 w-3.5 text-muted" /> {r}
                    </div>
                  );
                })}
              </>
            ) : (
              <p className="px-3 py-6 text-center text-[12px] text-muted">Type to search screen captures, notes, claude-mem, Honcho, Notion, skills, routines and MCP servers.</p>
            )
          ) : !data ? (
            <p className="flex items-center justify-center gap-2 px-3 py-6 font-mono text-[11px] text-muted">
              <LoaderCircle className="h-3.5 w-3.5 robo-spin" /> Searching…
            </p>
          ) : (
            <>
              {groups.map((s) => {
                const meta = SOURCE_META[s.source];
                return (
                  <section key={s.source} className="mb-1">
                    <header className="flex items-baseline gap-2 px-2 pb-0.5 pt-1.5">
                      <meta.icon className="h-3 w-3 translate-y-0.5" style={{ color: meta.color }} aria-hidden />
                      <span className="hud-label text-[10px]">{s.label}</span>
                      <span className="font-mono text-[9.5px] text-muted">
                        {s.total != null ? `${formatInt(s.total)} match${s.total === 1 ? '' : 'es'}` : s.mode === 'semantic' ? 'semantic' : ''}
                      </span>
                      {s.status !== 'ok' && <span className={cn('font-mono text-[9.5px]', STATUS_META[s.status].text)}>{s.status}</span>}
                    </header>
                    {s.hits.map((h) => {
                      index++;
                      const i = index;
                      return (
                        <SearchHitRow
                          key={h.id}
                          domId={`palette-item-${i}`}
                          hit={h}
                          active={i === active}
                          nowMs={nowMs}
                          router={router}
                          compact
                          onHover={() => setActive(i)}
                          onOpened={() => {
                            pushRecent(query);
                            close();
                          }}
                        />
                      );
                    })}
                  </section>
                );
              })}
              {current && !groups.length && !loading && (
                <p className="px-3 py-4 text-center text-[12px] text-muted">
                  No quick matches for “{query}”.
                </p>
              )}
              {(() => {
                index++;
                const i = index;
                return (
                  <div
                    id={`palette-item-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={seeAll}
                    className={cn(
                      'mt-1 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.06em]',
                      i === active ? 'border-orange/45 bg-orange/[0.07] text-paper' : 'border-transparent text-secondary',
                    )}
                  >
                    See all results for “<span className="max-w-[40ch] truncate normal-case tracking-normal">{query}</span>”
                    <ArrowRight className="ml-auto h-3.5 w-3.5 text-orange" />
                  </div>
                );
              })()}
            </>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-subtle px-4 py-2 font-mono text-[9.5px] text-muted">
          {sources.length > 0 && current ? (
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {sources.map((s) => (
                <span key={s.source} className="flex items-center gap-1" title={`${s.label}: ${s.status}${s.note ? ` — ${s.note}` : ''}`}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_META[s.status].dot)} />
                  {SOURCE_META[s.source].short}
                </span>
              ))}
            </span>
          ) : (
            <span>8 sources · read-only</span>
          )}
          <span className="ml-auto">↑↓ select · ↵ open · ⌘↵ secondary · esc close</span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export default SearchPalette;
