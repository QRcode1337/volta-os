'use client';
// Client side of VOLTA Search: the debounced/abortable query hook, source metadata, recent searches and link opening.
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BookUser, Brain, CalendarClock, FileText, NotebookText, ScanText, Server, Sparkles } from 'lucide-react';
import type { SearchHit, SearchResponse, SearchSourceId, SearchSourceState } from '@/lib/server/search/types';

export const MIN_QUERY_CHARS = 2;

export const SOURCE_META: Record<SearchSourceId, { label: string; short: string; icon: LucideIcon; color: string }> = {
  ltm: { label: 'LTM captures', short: 'LTM', icon: ScanText, color: '#FF5500' },
  notes: { label: 'Obsidian notes', short: 'Notes', icon: NotebookText, color: '#A855F7' },
  'claude-mem': { label: 'claude-mem', short: 'claude-mem', icon: Brain, color: '#F5A623' },
  honcho: { label: 'Honcho', short: 'Honcho', icon: BookUser, color: '#14B8A6' },
  notion: { label: 'Notion', short: 'Notion', icon: FileText, color: '#E8E4DA' },
  skills: { label: 'Skills', short: 'Skills', icon: Sparkles, color: '#3B82F6' },
  routines: { label: 'Routines', short: 'Routines', icon: CalendarClock, color: '#F5A623' },
  mcp: { label: 'MCP servers', short: 'MCP', icon: Server, color: '#8B5CF6' },
};

export const STATUS_META: Record<SearchSourceState, { label: string; dot: string; text: string }> = {
  ok: { label: 'ok', dot: 'bg-green', text: 'text-green' },
  partial: { label: 'partial', dot: 'bg-amber', text: 'text-amber' },
  timeout: { label: 'timeout', dot: 'bg-amber', text: 'text-amber' },
  offline: { label: 'offline', dot: 'bg-[#EF4444]', text: 'text-[#F87171]' },
  error: { label: 'error', dot: 'bg-[#EF4444]', text: 'text-[#F87171]' },
  skipped: { label: 'skipped', dot: 'bg-highlight', text: 'text-muted' },
};

export interface SearchState {
  data: SearchResponse | null;
  loading: boolean;
  error: string | null;
}

const RETRY_DELAYS_MS = [1_500, 3_000];

/**
 * Debounced (200 ms) search. Every new query aborts the request in flight, so a stale answer never lands.
 * When the server says a source was still warming (`retry`), asks again up to twice.
 */
export function useSearch(query: string, opts: { limit: number; enabled?: boolean; debounceMs?: number }): SearchState {
  const { limit, enabled = true, debounceMs = 200 } = opts;
  const [state, setState] = useState<SearchState>({ data: null, loading: false, error: null });

  useEffect(() => {
    const q = query.trim();
    if (!enabled || q.length < MIN_QUERY_CHARS) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState((s) => ({ ...s, loading: true, error: null }));
    const run = (attempt: number) => {
      fetch(`/api/search?${new URLSearchParams({ q, limit: String(limit) })}`, { signal: ac.signal, cache: 'no-store' })
        .then(async (r) => {
          const body = (await r.json().catch(() => ({}))) as SearchResponse & { error?: string };
          if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
          return body;
        })
        .then((data) => {
          if (ac.signal.aborted) return;
          const again = data.retry && attempt < RETRY_DELAYS_MS.length;
          setState({ data, loading: again, error: null });
          if (again) timer = setTimeout(() => run(attempt + 1), RETRY_DELAYS_MS[attempt]);
        })
        .catch((err: unknown) => {
          if (ac.signal.aborted) return;
          setState((s) => ({ ...s, loading: false, error: (err as Error).message || 'Search failed' }));
        });
    };
    timer = setTimeout(() => run(0), debounceMs);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [query, limit, enabled, debounceMs]);

  return state;
}

/** Fire-and-forget: lets the server start building the notes index while the user types. */
export function warmSearch(): void {
  fetch('/api/search?q=', { cache: 'no-store' }).catch(() => {});
}

// ── Recent searches (per browser; a convenience only) ──

const RECENT_KEY = 'volta.search.recent.v1';
const RECENT_MAX = 8;

export function loadRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(q: string): string[] {
  const v = q.trim();
  if (v.length < MIN_QUERY_CHARS) return loadRecent();
  const next = [v, ...loadRecent().filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, RECENT_MAX);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage blocked: keep the in-memory list only
  }
  return next;
}

export function clearRecent(): void {
  try {
    window.localStorage.removeItem(RECENT_KEY);
  } catch {
    // ignore
  }
}

// ── Opening results ──

export interface Navigator {
  push: (href: string) => void;
}

/**
 * Apps that follow their query string after mount (useSearchParams). LTM, Honcho and Search read their deep-link
 * params once on mount, so a link to the page that is already open is loaded fresh instead of pushed.
 */
const LIVE_PARAM_PATHS = new Set(['/second-brain']);

/** In-app routes go through the router; http(s) opens a new tab; custom schemes (obsidian://) hand off to the app. */
export function openHref(href: string, external: boolean, router: Navigator): void {
  if (!external && href.startsWith('/')) {
    const path = href.split(/[?#]/)[0];
    if (path === window.location.pathname && !LIVE_PARAM_PATHS.has(path)) window.location.assign(href);
    else router.push(href);
    return;
  }
  if (/^https?:\/\//i.test(href)) {
    window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }
  window.location.href = href;
}

/** Opens a hit (primary link) or its ⌘Enter target. Returns false when there is nothing to open. */
export function openHit(hit: SearchHit, router: Navigator, secondary = false): boolean {
  if (secondary && hit.secondary) {
    openHref(hit.secondary.href, hit.secondary.external, router);
    return true;
  }
  if (!hit.href) return false;
  openHref(hit.href, hit.external, router);
  return true;
}

// ── Formatting (client-only: results only exist after a fetch, so this never runs during SSR) ──

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "3m ago" · "5h ago" · "Oct 21" · "Oct 21, 2025". LTM timestamps have no zone and parse as local time. */
export function whenLabel(when: string | null, nowMs: number): string | null {
  if (!when) return null;
  const t = Date.parse(when);
  if (!Number.isFinite(t)) return null;
  const mins = Math.round((nowMs - t) / 60_000);
  if (mins >= 0 && mins < 1) return 'just now';
  if (mins >= 0 && mins < 60) return `${mins}m ago`;
  if (mins >= 0 && mins < 24 * 60) return `${Math.round(mins / 60)}h ago`;
  const d = new Date(t);
  const sameYear = d.getFullYear() === new Date(nowMs).getFullYear();
  return `${MON[d.getMonth()]} ${d.getDate()}${sameYear ? '' : `, ${d.getFullYear()}`}`;
}

export function whenTitle(when: string | null): string | undefined {
  if (!when) return undefined;
  const t = Date.parse(when);
  return Number.isFinite(t) ? new Date(t).toLocaleString() : undefined;
}
