'use client';
// Shared helpers for the real-data Second Brain analytics tabs (Timeline, Routines, Skills, Applications):
// a polling-capped fetch hook, a mount-only clock, relative-time labels and the loading/empty/error panels.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Inbox, PlugZap, RefreshCw } from 'lucide-react';
import { ApiError, getJson } from '@/components/ltm/ltm-client';
import { cn } from '@/lib/cn';

/** Never poll faster than this (project rule: live data at most every 60s). */
export const MIN_POLL_MS = 60_000;

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  unavailable: boolean; // server said the source is offline (drive unmounted, db missing, …)
  loading: boolean; // true only until the first answer (polls refresh silently)
  updatedAt: number | null; // epoch ms of the last good answer
  reload: () => void;
}

interface InnerState<T> {
  data: T | null;
  error: string | null;
  unavailable: boolean;
  loading: boolean;
  updatedAt: number | null;
}

const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

/**
 * GET a JSON endpoint after mount (cache: 'no-store', AbortController). With `pollMs` > 0 it refreshes
 * every max(pollMs, 60s); a failed poll keeps the last good data and only sets `error`.
 * The next poll is always counted from the start of the last request (one setTimeout, re-armed by every request,
 * the same rule as shared-json.ts), so a refresh on tab return never leads to a second request < 60s later.
 * While the tab is hidden the timer lapses; on return a refresh runs at once if a poll is due, else the timer
 * is re-armed for the remainder. A poll never pre-empts a request that is still in flight.
 */
export function useApi<T>(url: string | null, pollMs = 0): ApiState<T> {
  const [state, setState] = useState<InnerState<T>>({ data: null, error: null, unavailable: false, loading: true, updatedAt: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    let ctrl: AbortController | null = null;
    let inflight = false;
    let lastStart = 0;
    let timer = 0;
    const every = pollMs > 0 ? Math.max(pollMs, MIN_POLL_MS) : 0;
    const schedule = (delay: number) => {
      if (timer) window.clearTimeout(timer);
      timer = every && alive ? window.setTimeout(tick, Math.max(0, delay)) : 0;
    };
    // Hidden tab: let the timer lapse (onVisible resumes). In flight (slow/hung request): look again later.
    function tick() {
      timer = 0;
      if (!alive || !isVisible()) return;
      if (inflight) schedule(every);
      else run(false);
    }
    const run = (initial: boolean) => {
      ctrl?.abort();
      const mine = new AbortController();
      ctrl = mine;
      inflight = true;
      lastStart = Date.now();
      schedule(every);
      if (initial) setState((s) => ({ ...s, loading: true, error: null }));
      getJson<T>(url, mine.signal)
        .then((data) => {
          if (alive && !mine.signal.aborted) setState({ data, error: null, unavailable: false, loading: false, updatedAt: Date.now() });
        })
        .catch((e: unknown) => {
          if (!alive || mine.signal.aborted) return;
          setState((s) => ({
            ...s,
            loading: false,
            error: e instanceof Error ? e.message : String(e),
            unavailable: e instanceof ApiError && e.unavailable,
          }));
        })
        .finally(() => {
          if (ctrl === mine) inflight = false;
        });
    };
    const onVisible = () => {
      if (!alive || !isVisible()) return;
      const since = Date.now() - lastStart;
      if (since >= every && !inflight) run(false);
      else if (!timer) schedule(inflight ? every : every - since);
    };
    run(true);
    if (every) document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      ctrl?.abort();
      if (timer) window.clearTimeout(timer);
      timer = 0;
      if (every) document.removeEventListener('visibilitychange', onVisible);
    };
  }, [url, pollMs, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/**
 * Wall-clock epoch ms, set only after mount (null during SSR / first paint) and refreshed every `intervalMs`
 * while the tab is visible (it catches up immediately when the tab comes back).
 */
export function useNow(intervalMs = MIN_POLL_MS): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      if (isVisible()) setNow(Date.now());
    };
    setNow(Date.now());
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs]);
  return now;
}

/** ISO (with zone) vs now → "in 23m", "5h ago", "3d ago". Returns "—" before mount or for null. */
export function relTime(iso: string | null | undefined, now: number | null): string {
  if (!iso || now === null) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const diff = t - now;
  const mins = Math.round(Math.abs(diff) / 60_000);
  let span: string;
  if (mins < 1) return diff >= 0 ? 'in <1m' : 'just now';
  if (mins < 60) span = `${mins}m`;
  else if (mins < 48 * 60) span = `${Math.round(mins / 60)}h`;
  else span = `${Math.round(mins / 1440)}d`;
  return diff >= 0 ? `in ${span}` : `${span} ago`;
}

/** ISO → local "21:05", or "Sat 09:00" when it isn't within the next/last 20h. Call only with data fetched after mount. */
export function clockLabel(iso: string | null | undefined, now: number | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (now !== null && Math.abs(d.getTime() - now) < 20 * 3_600_000) return hm;
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${hm}`;
}

/** Search helper: true when the query is empty or any field contains it (case-insensitive). */
export function matchesQuery(query: string | undefined, ...fields: (string | null | undefined)[]): boolean {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => (f ?? '').toLowerCase().includes(q));
}

const PLUGIN_PALETTE = ['#A855F7', '#14B8A6', '#3B82F6', '#EAB308', '#EC4899', '#06B6D4', '#84CC16', '#6366F1', '#F472B6', '#2DD4BF'];
export const USER_SKILL_COLOR = '#FF5500';

/** Stable colour per skill origin: user skills are VOLTA orange, each plugin gets a hashed palette colour. */
export function originColor(plugin: string | null): string {
  if (!plugin) return USER_SKILL_COLOR;
  let h = 0;
  for (let i = 0; i < plugin.length; i++) h = (h * 31 + plugin.charCodeAt(i)) >>> 0;
  return PLUGIN_PALETTE[h % PLUGIN_PALETTE.length];
}

/** Compact header stat: tiny mono label + Doto value. */
export function HeaderStat({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: string;
  tone?: 'red' | 'amber' | 'green' | 'orange' | 'muted';
  /** Native tooltip, e.g. the basis of an estimate. */
  title?: string;
}) {
  return (
    <div className="flex items-baseline gap-2" title={title}>
      <span className="font-mono text-[9px] tracking-widest text-muted">{label}</span>
      <span
        className={cn(
          'font-doto text-[15px] font-bold',
          tone === 'red' ? 'text-red-400' : tone === 'amber' ? 'text-amber' : tone === 'green' ? 'text-green' : tone === 'orange' ? 'text-orange' : tone === 'muted' ? 'text-secondary' : 'text-paper',
        )}
      >
        {value}
      </span>
    </div>
  );
}

type StateKind = 'loading' | 'error' | 'offline' | 'empty';

/**
 * Loading / error / offline / empty state in the HUD style. `minH` is the only min-height class applied
 * (cn() has no tailwind-merge, so a second min-h-* in className would lose to whichever the CSS emits last).
 */
export function ViewState({
  kind,
  title,
  detail,
  onRetry,
  className,
  minH = 'min-h-[200px]',
}: {
  kind: StateKind;
  title: string;
  detail?: string;
  onRetry?: () => void;
  className?: string;
  /** Tailwind min-height class; full panels keep the 200px default, inline empties pass a smaller one. */
  minH?: string;
}) {
  const icon =
    kind === 'loading' ? (
      <span className="h-5 w-5 rounded-full border-2 border-subtle border-t-orange robo-spin" />
    ) : kind === 'error' ? (
      <AlertTriangle size={18} className="text-red-400" />
    ) : kind === 'offline' ? (
      <PlugZap size={18} className="text-amber" />
    ) : (
      <Inbox size={18} className="text-muted" />
    );
  return (
    <div className={cn('flex h-full w-full flex-col items-center justify-center gap-2.5 px-6 text-center', minH, className)}>
      {icon}
      <span className={cn('hud-label', kind === 'loading' && 'robo-pulse rounded-full px-3 py-1')}>{title}</span>
      {detail && <p className="max-w-[460px] font-mono text-[10.5px] leading-relaxed text-muted">{detail}</p>}
      {onRetry && kind !== 'loading' && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex h-7 items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-3 font-mono text-[10px] font-semibold tracking-wide text-secondary transition-colors hover:border-orange hover:text-orange"
        >
          <RefreshCw size={11} /> Retry
        </button>
      )}
    </div>
  );
}

/** Pick the right ViewState for an ApiState that has no data yet (or null when data is present). */
export function apiGate<T>(api: ApiState<T>, labels: { loading: string; error: string; offline?: string }): ReactNode | null {
  if (api.data) return null;
  if (api.loading) return <ViewState kind="loading" title={labels.loading} />;
  if (api.unavailable)
    return <ViewState kind="offline" title={labels.offline ?? 'SOURCE OFFLINE'} detail={api.error ?? undefined} onRetry={api.reload} />;
  return <ViewState kind="error" title={labels.error} detail={api.error ?? 'Unknown error'} onRetry={api.reload} />;
}
