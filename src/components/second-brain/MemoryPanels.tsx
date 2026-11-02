'use client';
// Beside the vault graph: the Memory sources rail (every memory store, live counts, which ones "Ask" searches)
// and the Agent memory dock (what each Honcho agent heard lately + one box to search across the enabled sources).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, ExternalLink, Loader2, RefreshCw, Search, X } from 'lucide-react';
import type { MemorySource } from '@/types/sources';
import type { SearchSourceId } from '@/lib/server/search/types';
import type { AgentsPayload } from '@/app/api/brain/agents/route';
import { cn } from '@/lib/cn';
import { MIN_QUERY_CHARS, SOURCE_META, openHit, openHref, useSearch, whenLabel } from '@/components/search/search-client';
import { relTime, useApi } from './analytics-shared';

// ───────── Which sources "Ask" searches (per viewer, localStorage) ─────────

/** Memory source → the search index that covers it (calendar / YouTube have none). */
const SEARCH_ID: Partial<Record<MemorySource['id'], SearchSourceId>> = {
  ltm: 'ltm',
  honcho: 'honcho',
  'claude-mem': 'claude-mem',
  'pieces-vault': 'notes',
  obsidian: 'notes',
  notion: 'notion',
};

/** `color` at `pct`% opacity (works for CSS variables, unlike hex-alpha suffixes). */
const alpha = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** Theme tokens (globals.css), so the panels follow the rest of the OS. */
const SOURCE_COLOR: Record<MemorySource['id'], string> = {
  ltm: 'var(--accent-orange)',
  honcho: 'var(--accent-teal)',
  'claude-mem': 'var(--accent-amber)',
  'pieces-vault': 'var(--dept-apps)',
  obsidian: 'var(--accent-purple)',
  notion: 'var(--text-paper)',
  calendar: 'var(--dept-product)',
  youtube: 'var(--dept-content)',
};

const TOGGLES_KEY = 'volta.secondBrain.memoryToggles.v1';
const DOCK_KEY = 'volta.secondBrain.agentDock.v1';
/** Fired by Refresh all once the server re-read Honcho, so the dock reloads at once. */
const AGENTS_REFRESHED = 'volta:brain-agents-refreshed';

export interface MemoryToggles {
  off: ReadonlySet<string>;
  toggle: (id: string) => void;
  /** Turns every source back on. */
  clear: () => void;
  /** Search indexes "Ask" should query (undefined = all). */
  searchSources: SearchSourceId[] | undefined;
}

export function useMemoryToggles(): MemoryToggles {
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TOGGLES_KEY);
      if (raw) setOff(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* storage blocked: everything stays on */
    }
  }, []);
  const toggle = useCallback((id: string) => {
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(TOGGLES_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const clear = useCallback(() => {
    setOff(new Set());
    try {
      localStorage.removeItem(TOGGLES_KEY);
    } catch {
      /* ignore */
    }
  }, []);
  const searchSources = useMemo(() => {
    if (off.size === 0) return undefined;
    const on = new Set<SearchSourceId>();
    for (const [src, sid] of Object.entries(SEARCH_ID)) if (sid && !off.has(src)) on.add(sid);
    // Skills / routines / MCP have no row in the rail; they ride along whenever Ask is scoped.
    on.add('skills');
    on.add('routines');
    on.add('mcp');
    return [...on];
  }, [off]);
  return { off, toggle, clear, searchSources };
}

// ───────── Right rail: memory sources ─────────

const STATUS_DOT: Record<string, string> = {
  live: 'bg-green shadow-[0_0_6px_rgba(34,197,94,0.7)]',
  idle: 'bg-amber',
  offline: 'bg-[#EF4444]',
};

export function MemorySourcesRail({
  toggles,
  nowMs,
  onRefreshAll,
  className,
}: {
  toggles: MemoryToggles;
  nowMs: number | null;
  onRefreshAll: () => void;
  className?: string;
}) {
  const router = useRouter();
  const { data, loading, error, reload, updatedAt } = useApi<{
    sources: MemorySource[];
  }>('/api/sources', 60_000);
  const [refreshing, setRefreshing] = useState(false);
  const sources = data?.sources ?? [];
  const searchable = sources.filter((s) => SEARCH_ID[s.id]);
  const onCount = searchable.filter((s) => !toggles.off.has(s.id)).length;

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([fetch('/api/vaults?refresh=1', { cache: 'no-store' }), fetch('/api/brain/agents?refresh=1', { cache: 'no-store' })]);
      reload();
      window.dispatchEvent(new Event(AGENTS_REFRESHED));
      onRefreshAll();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <aside aria-label="Memory sources" className={cn('flex w-[268px] shrink-0 flex-col border-l border-subtle bg-panel/80 backdrop-blur', className)}>
      <div className="flex items-center justify-between border-b border-subtle px-3.5 py-2.5">
        <span className="hud-label !text-[10px]">MEMORY SOURCES</span>
        <span className="font-mono text-[9.5px] text-muted" title="Sources the Ask box searches">
          {searchable.length ? `${onCount}/${searchable.length} in Ask` : ''}
        </span>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5 [scrollbar-width:thin]">
        {loading && !data && (
          <li className="flex items-center gap-2 px-2 py-3 font-mono text-[10.5px] text-muted">
            <Loader2 size={12} className="robo-spin" /> reading sources…
          </li>
        )}
        {error && !data && <li className="px-2 py-3 font-mono text-[10.5px] text-red-400">/api/sources failed: {error}</li>}
        {data && sources.length === 0 && <li className="px-2 py-3 font-mono text-[10.5px] text-muted">No memory sources reported.</li>}
        {sources.map((s) => {
          const sid = SEARCH_ID[s.id];
          const on = !!sid && !toggles.off.has(s.id);
          const color = SOURCE_COLOR[s.id] ?? 'var(--text-muted)';
          return (
            <li key={s.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-panel-hover/60">
              <span
                className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-subtle font-doto text-[13px] font-bold"
                style={{ background: alpha(color, 12), color }}
                aria-hidden
              >
                {s.name.slice(0, 1).toUpperCase()}
                <span className={cn('absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-panel', STATUS_DOT[s.status] ?? 'bg-highlight')} />
              </span>
              <button
                type="button"
                disabled={!s.href}
                onClick={() => s.href && openHref(s.href, !!s.external, router)}
                className="min-w-0 flex-1 text-left disabled:cursor-default"
                title={`${s.detail}${s.setupHint ? `\n${s.setupHint}` : ''}`}
                aria-describedby={`src-${s.id}-detail`}
              >
                <span className="flex items-center gap-1 truncate text-[12.5px] font-semibold text-paper">
                  {s.name}
                  {s.external && s.href && (
                    <ExternalLink size={9} className="shrink-0 text-muted opacity-0 group-focus-within:opacity-100 group-hover:opacity-100" />
                  )}
                </span>
                <span className="block truncate font-mono text-[9.5px] text-secondary">{s.headline}</span>
                <span id={`src-${s.id}-detail`} className="sr-only">
                  {s.status}. {s.detail}
                  {s.setupHint ? ` ${s.setupHint}` : ''}
                </span>
              </button>
              {sid ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`Search ${s.name} in Ask`}
                  onClick={() => toggles.toggle(s.id)}
                  className={cn(
                    'relative h-[18px] w-8 shrink-0 rounded-full border transition-colors before:absolute before:-inset-[4px] before:content-[""]',
                    on ? 'border-orange/60 bg-orange/80' : 'border-highlight bg-obsidian',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full transition-all',
                      on ? 'left-[15px] bg-obsidian' : 'left-[2px] bg-muted',
                    )}
                  />
                </button>
              ) : (
                <span className="w-8 shrink-0 text-center font-mono text-[9px] text-muted" title="Not searchable" aria-label="Not searchable">
                  —
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="border-t border-subtle p-3">
        <button
          type="button"
          onClick={refreshAll}
          disabled={refreshing}
          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-orange/50 bg-orange/15 font-mono text-[10.5px] font-semibold tracking-[0.08em] text-orange transition-colors hover:bg-orange/25 disabled:opacity-60"
        >
          <RefreshCw size={12} className={cn(refreshing && 'robo-spin')} /> {refreshing ? 'REFRESHING…' : 'REFRESH ALL'}
        </button>
        <div className="mt-1.5 text-center font-mono text-[9px] text-muted">
          {updatedAt ? `checked ${relTime(new Date(updatedAt).toISOString(), nowMs)}` : ' '}
        </div>
      </div>
    </aside>
  );
}

// ───────── Bottom dock: agent memory ─────────

const AGENT_TINT = ['var(--accent-teal)', 'var(--accent-purple)', 'var(--accent-amber)', 'var(--dept-product)', 'var(--accent-orange)'];

function useDockOpen(): [boolean, () => void] {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(DOCK_KEY) === 'closed') setOpen(false);
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = useCallback(() => {
    setOpen((o) => {
      try {
        localStorage.setItem(DOCK_KEY, o ? 'closed' : 'open');
      } catch {
        /* ignore */
      }
      return !o;
    });
  }, []);
  return [open, toggle];
}

function clock(iso: string, nowMs: number | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const hm = d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  if (nowMs !== null && nowMs - d.getTime() < 20 * 3600_000) return hm;
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hm}`;
}

export function AgentMemoryDock({ toggles, nowMs }: { toggles: MemoryToggles; nowMs: number | null }) {
  const router = useRouter();
  const [open, toggleOpen] = useDockOpen();
  const { data, loading, error, reload } = useApi<AgentsPayload>('/api/brain/agents', 60_000);
  useEffect(() => {
    window.addEventListener(AGENTS_REFRESHED, reload);
    return () => window.removeEventListener(AGENTS_REFRESHED, reload);
  }, [reload]);
  const [ask, setAsk] = useState('');
  const search = useSearch(ask, {
    limit: 4,
    enabled: open,
    sources: toggles.searchSources,
  });

  const agents = data?.agents ?? [];
  const names = agents.map((a) => a.id);
  const hits = useMemo(() => (search.data?.sources ?? []).flatMap((s) => s.hits).slice(0, 8), [search.data]);
  const chips = useMemo(() => [...new Set([...names.slice(0, 3), 'decision', 'todo'])], [names]);
  const offCount = toggles.off.size;
  const status: { label: string; dot: string } =
    !data && error
      ? { label: 'UNAVAILABLE', dot: 'bg-red-400' }
      : !data
        ? { label: 'CONNECTING…', dot: 'bg-highlight' }
        : !data.online
          ? { label: 'HONCHO OFFLINE', dot: 'bg-amber' }
          : { label: `LIVE · SYNCED ${relTime(data.fetchedAt, nowMs).toUpperCase()}`, dot: 'bg-green shadow-[0_0_6px_rgba(34,197,94,0.8)]' };

  return (
    <section aria-labelledby="agent-dock-title" className="relative z-20 shrink-0 border-t border-subtle bg-panel/90 backdrop-blur">
      <button
        type="button"
        onClick={toggleOpen}
        className="flex w-full items-center gap-3 px-4 py-2 text-left"
        aria-expanded={open}
        aria-controls="agent-dock-body"
      >
        <span className="flex items-center gap-1.5 font-mono text-[9.5px] font-semibold tracking-[0.14em] text-secondary">
          <span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} />
          {status.label}
        </span>
        <span id="agent-dock-title" className="min-w-0 flex-1 truncate text-[14px] font-bold tracking-tight text-paper">
          Everything your agents heard
          <span className="ml-2 hidden font-normal text-[11.5px] text-secondary md:inline">
            {names.length ? `${names.join(', ')} in one memory. Ask it anything they said.` : ''}
          </span>
        </span>
        {open ? <ChevronDown size={15} className="text-muted" /> : <ChevronUp size={15} className="text-muted" />}
      </button>

      {open && (
        <div id="agent-dock-body" className="max-h-[36vh] overflow-y-auto px-4 pb-4 [scrollbar-width:thin]">
          {loading && !data && (
            <div className="flex items-center gap-2 py-3 font-mono text-[10.5px] text-muted">
              <Loader2 size={12} className="robo-spin" /> reading Honcho…
            </div>
          )}
          {error && !data && <div className="py-3 font-mono text-[10.5px] text-red-400">/api/brain/agents failed: {error}</div>}
          {data?.online === false && (
            <div className="py-2 font-mono text-[10.5px] text-muted">
              Honcho isn't running on 127.0.0.1:8000, so there are no agent chats to show.
            </div>
          )}

          {data?.online && agents.length === 0 && (
            <div className="py-2 font-mono text-[10.5px] text-muted">Honcho is up but has no agent workspaces yet.</div>
          )}
          {agents.length > 0 && (
            <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
              {agents.map((a, i) => {
                const tint = AGENT_TINT[i % AGENT_TINT.length];
                return (
                  <div
                    key={a.id}
                    className="rounded-xl border border-subtle p-3"
                    style={{
                      background: `linear-gradient(140deg, ${alpha(tint, 8)}, transparent 65%), var(--bg-panel-elevated)`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full border font-doto text-[13px] font-bold"
                        style={{
                          borderColor: alpha(tint, 50),
                          color: tint,
                          background: alpha(tint, 10),
                        }}
                      >
                        {a.id.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-paper">{a.id}</div>
                        <div className="font-mono text-[9.5px] text-secondary">
                          {a.sessions} session{a.sessions === 1 ? '' : 's'} · {a.lastActive ? relTime(a.lastActive, nowMs) : 'nothing yet'}
                        </div>
                      </div>
                    </div>
                    {a.error ? (
                      <div className="mt-2.5 font-mono text-[10.5px] text-red-400">Couldn't read this agent: {a.error}</div>
                    ) : a.lines.length === 0 ? (
                      <div className="mt-2.5 text-[11.5px] text-secondary">Nothing saved yet.</div>
                    ) : (
                      <ul className="mt-2.5 space-y-1.5">
                        {a.lines.map((l) => (
                          <li key={l.id}>
                            <button
                              type="button"
                              onClick={() =>
                                router.push(`/apps/honcho?${new URLSearchParams({ w: a.id, session: l.sessionId, message: l.id, at: l.at })}`)
                              }
                              className="flex w-full gap-2 rounded px-1 py-0.5 text-left hover:bg-panel-hover/60"
                              title={`${l.peer} · ${new Date(l.at).toLocaleString()}`}
                            >
                              <span className="mt-px shrink-0 rounded px-1 font-mono text-[9.5px] text-paper" style={{ background: alpha(tint, 20) }}>
                                {clock(l.at, nowMs)}
                              </span>
                              <span className="line-clamp-2 text-[11.5px] leading-snug text-secondary">
                                <span className="font-semibold text-paper">{l.peer}</span> {l.text}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Ask across the enabled memory sources */}
          <label className="group relative mt-3 flex h-10 items-center">
            <Search size={14} className="pointer-events-none absolute left-3.5 text-muted group-focus-within:text-orange" />
            <span className="sr-only">Ask your memory</span>
            <input
              type="search"
              aria-describedby={offCount ? 'ask-scope' : undefined}
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              placeholder={`Ask your memory: what did ${names[0] ?? 'Hermes'} say about…`}
              className="h-full w-full rounded-full border border-subtle bg-obsidian pl-9 pr-9 text-[12.5px] text-paper placeholder:text-muted focus:border-orange/60 focus:outline-none"
            />
            {search.loading ? (
              <Loader2 size={13} className="robo-spin absolute right-3.5 text-muted" />
            ) : ask ? (
              <button
                type="button"
                onClick={() => setAsk('')}
                className="absolute right-3 rounded-full p-0.5 text-muted hover:text-paper"
                aria-label="Clear"
              >
                <X size={13} />
              </button>
            ) : null}
          </label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAsk(c)}
                className="rounded-full border border-subtle bg-obsidian px-2.5 py-1 font-mono text-[10px] text-secondary hover:border-highlight hover:text-paper"
              >
                {c}
              </button>
            ))}
            {toggles.searchSources && (
              <button
                id="ask-scope"
                type="button"
                onClick={toggles.clear}
                className="self-center rounded-full px-1.5 py-1 font-mono text-[9.5px] text-secondary hover:text-paper"
                title="Turn every memory source back on"
              >
                · {offCount} source{offCount === 1 ? '' : 's'} off — search all
              </button>
            )}
          </div>

          <div role="status" aria-live="polite" className="sr-only">
            {ask.trim().length < MIN_QUERY_CHARS
              ? ''
              : search.loading
                ? 'Searching…'
                : search.error
                  ? `Search failed: ${search.error}`
                  : `${hits.length} result${hits.length === 1 ? '' : 's'}`}
          </div>
          {ask.trim().length >= MIN_QUERY_CHARS && (hits.length > 0 || search.error || !search.loading) && (
            <ul className="mt-2.5 divide-y divide-subtle overflow-hidden rounded-xl border border-subtle bg-obsidian">
              {search.error && <li className="px-3 py-2.5 font-mono text-[10.5px] text-red-400">{search.error}</li>}
              {!search.error && !search.loading && hits.length === 0 && (
                <li className="px-3 py-2.5 font-mono text-[10.5px] text-muted">Nothing in memory matches “{ask.trim()}”.</li>
              )}
              {hits.map((h) => {
                const meta = SOURCE_META[h.source];
                const when = nowMs !== null ? whenLabel(h.when, nowMs) : null;
                return (
                  <li key={`${h.source}:${h.id}`}>
                    <button
                      type="button"
                      onClick={() => openHit(h, router)}
                      disabled={!h.href}
                      className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-panel-hover/60 disabled:cursor-default"
                    >
                      <meta.icon size={13} className="mt-0.5 shrink-0" style={{ color: meta.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] text-paper">{h.title}</span>
                        <span className="line-clamp-1 text-[11px] text-secondary">{h.snippet}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[9.5px] text-muted">
                        {meta.short}
                        {when ? ` · ${when}` : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
