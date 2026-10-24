'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp, RotateCw, X } from 'lucide-react';
import type { UsageSummary } from '@/types/sources';
import { useSharedJson } from '@/components/dashboard/widgets/shared-json';
import { MODEL_COLORS } from '@/lib/mock-data';
import { OS_EVENTS } from '@/lib/events';
import { formatInt, formatTokens } from '@/lib/format';
import { cn } from '@/lib/cn';
import { dayLabel } from '@/components/ltm/ltm-client';
import { PixelMascotLogo } from '@/components/robo-ui';

// Claude Code usage from local transcripts (/api/usage). Plan limits are not exposed locally, so the bar
// shows raw token windows and a "today vs busiest day" meter instead of "% left".

const STORAGE_KEY = 'rubric:usage-robo-bar';
const USAGE_URL = '/api/usage';
const POLL_MS = 60_000;
const CLOCK_MS = 30_000;
/** A persisted snapshot older than this is discarded instead of shown. */
const MAX_SNAPSHOT_AGE_MS = 12 * 3_600_000;
const WINDOW_5H_MS = 5 * 3_600_000;
const NOTE = "Token counts from local Claude Code transcripts; plan limits aren't exposed locally.";

type Origin = 'none' | 'cached' | 'live';

interface Persisted {
  snapshot?: UsageSummary;
  savedAt?: string; // ISO
}

function isUsageSummary(d: unknown): d is UsageSummary {
  if (!d || typeof d !== 'object') return false;
  const u = d as Partial<UsageSummary>;
  return (
    typeof u.window5h?.total === 'number' &&
    typeof u.window7d?.total === 'number' &&
    Array.isArray(u.daily14d) &&
    Array.isArray(u.byModel7d) &&
    typeof u.sessions7d === 'number' &&
    !!u.cache &&
    (u.cache.state === 'WARM' || u.cache.state === 'COLD')
  );
}

/**
 * Last good payload, for an instant (clearly marked) warm start while the ~3 s cold scan runs.
 * Snapshots older than MAX_SNAPSHOT_AGE_MS (or without a parseable timestamp) are dropped.
 */
function readPersisted(now: number): Persisted {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Persisted;
    if (!isUsageSummary(parsed.snapshot)) return {};
    const savedAt = typeof parsed.savedAt === 'string' ? parsed.savedAt : parsed.snapshot.generatedAt;
    const t = Date.parse(savedAt);
    if (!Number.isFinite(t) || now - t > MAX_SNAPSHOT_AGE_MS) return {};
    return { snapshot: parsed.snapshot, savedAt };
  } catch {
    return {};
  }
}

/** Local calendar date "YYYY-MM-DD" (same keying as the server's daily14d). Client-only. */
function localDateKey(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "23:50" for today, "Oct 20 23:50" for another day. Client-only. */
function stamp(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  if (localDateKey(t) === localDateKey(now)) return clock(iso);
  return `${new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${clock(iso)}`;
}

/** Share of a total as a percent label; non-zero shares that would round to 0 read "<0.01%". */
function pctLabel(v: number, total: number): string {
  const pct = (v / total) * 100;
  if (v > 0 && pct < 0.01) return '<0.01%';
  return `${pct.toFixed(pct < 1 ? 2 : 1)}%`;
}

function writePersisted(value: Persisted): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode / quota) — the bar just starts empty next time
  }
}

/** 0 → "0m", 75 → "1h 15m", 3000 → "2d 2h". */
function formatIdle(mins: number): string {
  if (mins < 60) return `${mins}m`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`;
}

/** Local HH:MM for an ISO (UTC) timestamp. Client-only. */
function clock(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function agoMins(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
}

/** "claude-opus-5-5" → { label: "Opus 5.5", color }; unknown ids pass through. */
function modelMeta(id: string): { label: string; color: string } {
  const m = /^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/i.exec(id);
  if (!m) return { label: id.replace(/^claude-/, ''), color: '#A39E93' };
  const fam = m[1].toLowerCase();
  const label = `${fam[0].toUpperCase()}${fam.slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`;
  const color = fam === 'opus' ? MODEL_COLORS.OPUS : fam === 'sonnet' ? MODEL_COLORS.SONNET : fam === 'haiku' ? MODEL_COLORS.HAIKU : MODEL_COLORS.FABLE;
  return { label, color };
}

function meterTone(frac: number): { fill: string; text: string } {
  if (frac >= 0.75) return { fill: 'bg-orange', text: 'text-orange' };
  if (frac >= 0.4) return { fill: 'bg-amber', text: 'text-amber' };
  return { fill: 'bg-green', text: 'text-green' };
}

// ───────────────────────── collapsed bar pieces ─────────────────────────

function Readout({ label, value, sub, title, loading, stale }: { label: string; value: string; sub: string; title: string; loading: boolean; stale?: boolean }) {
  return (
    <div className={cn('flex shrink-0 items-baseline gap-1.5 whitespace-nowrap transition-opacity', stale && 'opacity-55')} title={title}>
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">{label}</span>
      <span className={cn('font-mono text-[11px] font-semibold text-paper', loading && 'animate-pulse text-muted')}>{value}</span>
      <span className="font-mono text-[10px] text-muted">{sub}</span>
    </div>
  );
}

function DotMeter({ label, frac, value, title, loading, stale }: { label: string; frac: number; value: string; title: string; loading: boolean; stale?: boolean }) {
  const filled = loading ? 0 : Math.max(frac > 0 ? 1 : 0, Math.min(10, Math.round(frac * 10)));
  const tone = meterTone(frac);
  return (
    <div className={cn('flex shrink-0 items-center gap-2 transition-opacity', stale && 'opacity-55')} title={title} aria-label={title}>
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">{label}</span>
      <span className="flex items-center gap-[3px]" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={cn('h-[6px] w-[6px] rounded-[1px]', i < filled ? tone.fill : 'bg-panel-hover', loading && 'animate-pulse')} />
        ))}
      </span>
      <span className={cn('rounded-full border border-subtle bg-panel-elevated px-1.5 py-px font-mono text-[10px] font-semibold', loading ? 'text-muted' : tone.text)}>{value}</span>
    </div>
  );
}

interface CacheView {
  state: 'WARM' | 'COLD';
  idleMinutes: number; // -1 = no messages yet
  minutesLeft: number;
  ttlMinutes: number;
}

function CachePill({ cache, lastAt, loading, staleNote }: { cache: CacheView | null; lastAt: string | null; loading: boolean; staleNote?: string | null }) {
  if (!cache) {
    return (
      <span className="inline-flex h-[26px] shrink-0 items-center whitespace-nowrap rounded-full border border-subtle px-3 font-mono text-[10px] font-semibold tracking-[0.04em] text-muted">
        {loading ? 'Prompt cache · reading transcripts…' : 'Prompt cache · no data'}
      </span>
    );
  }
  const warm = cache.state === 'WARM';
  const text = warm ? `🔥 WARM · ${cache.minutesLeft}m left` : cache.idleMinutes < 0 ? '❄️ COLD · no messages yet' : `❄️ COLD · idle ${formatIdle(cache.idleMinutes)}`;
  const title = `Estimated from the last assistant message${lastAt ? ` (${clock(lastAt)})` : ''} with a ${cache.ttlMinutes}-min prompt-cache TTL.${staleNote ? ` ${staleNote}` : ''}`;
  return (
    <span
      title={title}
      aria-label={`Prompt cache ${cache.state}. ${title}`}
      className={cn(
        'inline-flex h-[26px] shrink-0 items-center whitespace-nowrap rounded-full border px-3 font-mono text-[10px] font-semibold tracking-[0.04em] transition-all duration-300',
        staleNote && 'opacity-55',
        warm
          ? 'robo-pulse border-orange/70 bg-[linear-gradient(90deg,rgba(255,85,0,0.22),rgba(239,68,68,0.18))] text-[#FFB38A] shadow-[0_0_14px_rgba(255,85,0,0.45)]'
          : 'border-[#7DD3FC]/50 bg-[#0EA5E9]/10 text-[#BAE6FD] shadow-[0_0_12px_rgba(56,189,248,0.3)]',
      )}
    >
      {text}
    </span>
  );
}

// ───────────────────────── drawer pieces ─────────────────────────

function StatTile({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-[10px] border p-2.5', accent ? 'border-orange/50 bg-orange/[0.07]' : 'border-subtle bg-panel-elevated')}>
      <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-secondary">{label}</div>
      <div className={cn('font-doto text-[22px] font-bold leading-tight', accent ? 'text-orange' : 'text-paper')}>{value}</div>
      <div className="truncate font-mono text-[10px] text-muted" title={sub}>
        {sub}
      </div>
    </div>
  );
}

const MIX_PARTS = [
  { key: 'cacheRead', label: 'cache read', color: '#14B8A6' },
  { key: 'cacheWrite', label: 'cache write', color: '#F5A623' },
  { key: 'output', label: 'output', color: '#FF5500' },
  { key: 'input', label: 'input', color: '#A39E93' },
] as const;

function TokenMix({ w }: { w: UsageSummary['window7d'] }) {
  const total = w.total || 1;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">7-day token mix</span>
        <span className="font-mono text-[10px] text-muted">{formatInt(w.total)} tokens</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-panel-hover">
        {MIX_PARTS.map((p) => {
          const v = w[p.key];
          if (v <= 0) return null;
          return <span key={p.key} title={`${p.label}: ${formatInt(v)}`} style={{ width: `${Math.max(0.6, (v / total) * 100)}%`, background: p.color }} />;
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {MIX_PARTS.map((p) => (
          <span key={p.key} className="flex items-center gap-1 font-mono text-[9.5px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
            {p.label} <span className="text-secondary">{formatTokens(w[p.key])}</span>
            <span>({pctLabel(w[p.key], total)})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ModelBars({ rows }: { rows: UsageSummary['byModel7d'] }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div>
      <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">By model · 7 days</div>
      {rows.length === 0 ? (
        <p className="font-mono text-[10px] text-muted">No assistant messages in the last 7 days.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.slice(0, 7).map((r) => {
            const m = modelMeta(r.model);
            return (
              <li key={r.model} className="grid grid-cols-[96px_minmax(0,1fr)_92px] items-center gap-2" title={`${r.model} · ${formatInt(r.total)} tokens · ${formatInt(r.messages)} messages`}>
                <span className="truncate font-mono text-[10px] text-paper">{m.label}</span>
                <span className="h-[7px] overflow-hidden rounded-full bg-panel-hover">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(1.5, (r.total / max) * 100)}%`, background: m.color }} />
                </span>
                <span className="text-right font-mono text-[10px] text-secondary">
                  {formatTokens(r.total)} <span className="text-muted">· {formatInt(r.messages)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DailyBars({ days, todayDate, peakDate }: { days: UsageSummary['daily14d']; todayDate: string | null; peakDate: string | null }) {
  const max = Math.max(1, ...days.map((d) => d.total));
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">Daily tokens · 14 days</span>
        <span className="flex items-center gap-2.5 font-mono text-[9.5px] text-muted">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-[1px] bg-orange" /> today
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-[1px] bg-amber" /> busiest
          </span>
        </span>
      </div>
      <div className="flex h-[64px] items-end gap-[5px]">
        {days.map((d) => {
          const isToday = d.date === todayDate;
          const isPeak = d.date === peakDate;
          const h = d.total > 0 ? Math.max(3, (d.total / max) * 64) : 1;
          const lbl = dayLabel(d.date);
          return (
            <div key={d.date} className="group flex h-full min-w-0 flex-1 flex-col justify-end" title={`${lbl.long} · ${formatInt(d.total)} tokens · ${formatInt(d.messages)} messages`}>
              <span
                className={cn('block w-full rounded-t-[2px] transition-[filter] group-hover:brightness-125', isToday ? 'bg-orange' : isPeak ? 'bg-amber' : d.total > 0 ? 'bg-[#4A4740]' : 'bg-panel-hover')}
                style={{ height: h }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-[5px]">
        {days.map((d) => (
          <span key={d.date} className={cn('min-w-0 flex-1 text-center font-mono text-[8.5px]', d.date === todayDate ? 'text-orange' : 'text-muted')}>
            {Number(d.date.slice(8, 10))}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Claude Code "Usage Mod" bar — fixed bottom-center HUD fed by /api/usage (polled every 60 s). Collapsed:
 * 38px pill with 5H / 7D token readouts, a TODAY-vs-busiest-day meter and the prompt-cache pill.
 * Click expands upward into the usage drawer (by-model breakdown, 14-day daily bars).
 */
export function UsageRoboBar() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState<{ usage: UsageSummary; savedAt: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  // /api/usage through the shared home store: polled every 60 s while the tab is visible, paused while it is
  // hidden; becoming visible refetches only once the interval has passed, so tab-flipping never scans
  // transcripts more often than the poll cap. The last good payload is kept when a later poll fails.
  const q = useSharedJson<unknown>(USAGE_URL, POLL_MS);
  const live = useMemo(() => (q.data !== null && isUsageSummary(q.data) ? q.data : null), [q.data]);
  const badPayload = q.data !== null && !live;
  const load = q.reload;
  const fetching = q.refreshing;

  // Restore the last good snapshot (≤12 h old) after mount (no storage access during render → no hydration mismatch).
  useEffect(() => {
    const p = readPersisted(Date.now());
    if (p.snapshot) setSnapshot({ usage: p.snapshot, savedAt: p.savedAt ?? p.snapshot.generatedAt });
  }, []);

  // Persist each new live payload for the next warm start.
  useEffect(() => {
    if (live) writePersisted({ snapshot: live, savedAt: live.generatedAt });
  }, [live]);

  const usage: UsageSummary | null = live ?? snapshot?.usage ?? null;
  const origin: Origin = live ? 'live' : snapshot ? 'cached' : 'none';
  const cachedAt = snapshot?.savedAt ?? null;
  const status: 'loading' | 'ok' | 'error' = q.error || badPayload ? 'error' : live ? 'ok' : 'loading';
  const error = q.error ? q.error.message || 'request failed' : badPayload ? 'unexpected /api/usage payload' : null;

  // Client clock for the cache countdown and "ago" labels (after mount only).
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(id);
  }, []);

  // Collapse on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Collapse on the global Escape event (dispatched by GlobalShortcuts).
  useEffect(() => {
    const onEsc = () => setOpen(false);
    window.addEventListener(OS_EVENTS.escape, onEsc);
    return () => window.removeEventListener(OS_EVENTS.escape, onEsc);
  }, []);

  // ── derived ──
  const todayKey = now !== null ? localDateKey(now) : null;
  const view = useMemo(() => {
    if (!usage) return null;
    const days = usage.daily14d;
    // TODAY = the entry for the current local date, never "whatever the last entry was". A live payload
    // without today's date means no usage yet today (0); a cached snapshot from an earlier day is unknown.
    const entry = todayKey ? (days.find((d) => d.date === todayKey) ?? null) : null;
    const today = entry ?? (origin === 'live' && todayKey ? { date: todayKey, total: 0, messages: 0 } : null);
    const peak = days.reduce<UsageSummary['daily14d'][number] | null>((best, d) => (!best || d.total > best.total ? d : best), null);
    const peakTotal = peak?.total ?? 0;
    const todayFrac = peakTotal > 0 && today ? today.total / peakTotal : 0;
    return { today, peak: peakTotal > 0 ? peak : null, todayFrac };
  }, [usage, todayKey, origin]);

  // Cache state re-derived from lastMessageAt against the live clock so the countdown stays current between polls.
  const cache: CacheView | null = useMemo(() => {
    if (!usage) return null;
    const ttl = usage.cache.ttlMinutes;
    if (now !== null && usage.lastMessageAt) {
      const idle = agoMins(usage.lastMessageAt, now);
      return { state: idle < ttl ? 'WARM' : 'COLD', idleMinutes: idle, minutesLeft: Math.max(0, ttl - idle), ttlMinutes: ttl };
    }
    return usage.cache;
  }, [usage, now]);

  const loading = !usage;
  const stale = origin === 'cached' || (status === 'error' && !!usage);
  // When the shown numbers were captured: the snapshot's save time while cached, else the payload's own time.
  const dataAt = origin === 'cached' ? (cachedAt ?? usage?.generatedAt ?? null) : (usage?.generatedAt ?? null);
  const dataAgeMs = dataAt && now !== null ? Math.max(0, now - Date.parse(dataAt)) : null;
  const dataStamp = dataAt && now !== null ? stamp(dataAt, now) : null;
  const staleNote = stale ? `Stale: ${status === 'error' ? 'usage API offline, ' : ''}showing a snapshot from ${dataStamp ?? 'earlier'} — not current.` : null;
  const w5 = usage?.window5h;
  const w7 = usage?.window7d;
  // A stale 5-hour window that has fully elapsed says nothing about the current 5 hours.
  const w5Expired = stale && (dataAgeMs === null || dataAgeMs >= WINDOW_5H_MS);
  const peakLbl = view?.peak ? dayLabel(view.peak.date) : null;
  const todayPct = Math.round((view?.todayFrac ?? 0) * 100);
  const meterTitle = view?.today
    ? view.peak
      ? `Today ${formatInt(view.today.total)} tokens = ${todayPct}% of the busiest day in the last 14 days (${peakLbl?.label}: ${formatInt(view.peak.total)}). Basis: local transcripts, not a plan limit.${staleNote ? ` ${staleNote}` : ''}`
      : 'No usage in the last 14 days.'
    : usage && origin === 'cached'
      ? `Cached snapshot (${dataStamp ?? 'earlier'}) has no entry for today — waiting for live data.`
      : 'Reading local Claude Code transcripts…';
  const sourceChip =
    origin === 'live' && status === 'ok'
      ? `live · /api/usage · ${formatInt(usage?.scannedFiles ?? 0)} transcripts`
      : stale
        ? `stale · ${status === 'error' ? 'usage api offline' : 'cached'}${dataStamp ? ` · ${dataStamp}` : ''}`
        : status === 'error'
          ? 'offline'
          : 'loading…';

  return (
    <div ref={rootRef} className="fixed bottom-2 left-1/2 z-40 flex w-[min(760px,calc(100vw-24px))] -translate-x-1/2 flex-col">
      {/* ── Usage drawer (expands upward) ── */}
      <div
        id="usage-robo-drawer"
        className={cn(
          'grid transition-[grid-template-rows,opacity,transform] duration-300 ease-out',
          open ? 'grid-rows-[1fr] translate-y-0 opacity-100' : 'pointer-events-none grid-rows-[0fr] translate-y-2 opacity-0',
        )}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pb-2">
            <section
              aria-label="Claude Code usage"
              className="hud-scroll max-h-[calc(100vh-72px)] overflow-y-auto rounded-[14px] border border-subtle bg-panel/95 p-3 shadow-[0_-12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md"
            >
              <header className="mb-3 flex items-center gap-2">
                <PixelMascotLogo size={14} />
                <h2 className="hud-label">Claude Code Usage</h2>
                <span
                  className={cn(
                    'rounded-full border px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.08em]',
                    origin === 'live' && status === 'ok' ? 'border-green/40 text-green' : status === 'error' ? 'border-[#EF4444]/40 text-[#F87171]' : 'border-subtle text-muted',
                  )}
                  title={error ?? undefined}
                >
                  {sourceChip}
                </span>
                {usage && now !== null && <span className="hidden font-mono text-[9px] text-muted sm:inline">updated {stamp(usage.generatedAt, now)}</span>}
                <button
                  type="button"
                  onClick={() => void load()}
                  aria-label="Refresh usage"
                  title="Refresh usage"
                  className="ml-auto flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-hover hover:text-paper"
                >
                  <RotateCw size={12} className={cn(fetching && 'robo-spin')} />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close usage panel"
                  title="Close usage panel"
                  className="flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-hover hover:text-paper"
                >
                  <X size={13} />
                </button>
              </header>

              {!usage ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  {status === 'error' ? (
                    <>
                      <p className="font-mono text-[11px] text-[#F87171]">Usage API offline · {error}</p>
                      <button
                        type="button"
                        onClick={() => void load()}
                        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-highlight px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary hover:text-paper"
                      >
                        <RotateCw size={11} /> Retry
                      </button>
                    </>
                  ) : (
                    <p className="animate-pulse font-mono text-[11px] text-muted">Reading local Claude Code transcripts…</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3.5">
                  {stale && (
                    <p className="rounded-lg border border-amber/40 bg-amber/[0.07] px-2.5 py-1.5 font-mono text-[10px] text-amber">
                      {staleNote} {status === 'error' ? 'Retrying every 60 s.' : 'Live data is loading…'}
                    </p>
                  )}
                  <div className={cn('grid grid-cols-3 gap-2', stale && 'opacity-70')}>
                    <StatTile
                      label="Last 5 hours"
                      value={w5Expired ? '…' : formatTokens(usage.window5h.total)}
                      sub={w5Expired ? 'snapshot older than 5 h' : `${formatInt(usage.window5h.messages)} messages · ${formatTokens(usage.window5h.output)} output`}
                    />
                    <StatTile label="Last 7 days" value={formatTokens(usage.window7d.total)} sub={`${formatInt(usage.sessions7d)} sessions · ${formatInt(usage.window7d.messages)} messages`} />
                    <StatTile
                      label={view?.today ? `Today · ${todayPct}% of busiest day` : 'Today'}
                      value={view?.today ? formatTokens(view.today.total) : '…'}
                      sub={!view?.today ? 'not in cached snapshot' : view.peak ? `busiest ${peakLbl?.label} · ${formatTokens(view.peak.total)}` : 'no usage in 14 days'}
                      accent
                    />
                  </div>
                  <TokenMix w={usage.window7d} />
                  <ModelBars rows={usage.byModel7d} />
                  <DailyBars days={usage.daily14d} todayDate={todayKey} peakDate={view?.peak?.date ?? null} />
                  <div className="flex flex-col gap-1 border-t border-subtle pt-2.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-secondary">
                      <span>
                        Last message{' '}
                        <span className="text-paper">
                          {usage.lastMessageAt && now !== null ? `${clock(usage.lastMessageAt)} · ${formatIdle(agoMins(usage.lastMessageAt, now))} ago` : usage.lastMessageAt ? '…' : 'none yet'}
                        </span>
                      </span>
                      {cache && (
                        <span>
                          Cache <span className={cache.state === 'WARM' ? 'text-orange' : 'text-[#7DD3FC]'}>{cache.state}</span>
                          <span className="text-muted"> · est. {cache.ttlMinutes}-min TTL</span>
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-[9.5px] text-muted">{NOTE}</p>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* ── Collapsed pill bar (38px) ── */}
      <div
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-[38px] cursor-pointer items-center gap-3 overflow-hidden rounded-full border bg-panel/95 pl-3 pr-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur-md transition-colors',
          open ? 'border-highlight' : 'border-subtle hover:border-highlight',
        )}
        title={NOTE}
      >
        <span className="relative hidden shrink-0 sm:block">
          <PixelMascotLogo size={14} />
          {stale && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber" title={staleNote ?? 'Showing stale usage'} />}
        </span>
        {!usage && status === 'error' ? (
          <span className="shrink-0 whitespace-nowrap font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#F87171]" title={error ?? undefined}>
            Usage offline
          </span>
        ) : (
          <>
            <div className="hidden md:block">
              <Readout
                label="5H"
                value={w5 && !w5Expired ? formatTokens(w5.total) : '…'}
                sub={w5 && !w5Expired ? `· ${formatInt(w5.messages)} msg` : ''}
                title={
                  w5 && !w5Expired
                    ? `Last 5 hours: ${formatInt(w5.total)} tokens across ${formatInt(w5.messages)} assistant messages (incl. cache reads).${staleNote ? ` ${staleNote}` : ''}`
                    : w5Expired
                      ? `Cached snapshot (${dataStamp ?? 'earlier'}) is older than 5 hours — waiting for live data.`
                      : 'Loading'
                }
                loading={loading || w5Expired}
                stale={stale}
              />
            </div>
            <span className="hidden h-4 w-px shrink-0 bg-subtle md:block" aria-hidden />
            <Readout
              label="7D"
              value={w7 ? formatTokens(w7.total) : '…'}
              sub={usage ? `· ${formatInt(usage.sessions7d)} sess` : ''}
              title={
                w7 && usage
                  ? `Last 7 days: ${formatInt(w7.total)} tokens across ${formatInt(usage.sessions7d)} sessions (${formatInt(w7.messages)} messages).${staleNote ? ` ${staleNote}` : ''}`
                  : 'Loading'
              }
              loading={loading}
              stale={stale}
            />
            <span className="hidden h-4 w-px shrink-0 bg-subtle lg:block" aria-hidden />
            <div className="hidden lg:block">
              <DotMeter
                label="Today"
                frac={view?.todayFrac ?? 0}
                value={view?.today ? formatTokens(view.today.total) : '…'}
                title={meterTitle}
                loading={loading || !view?.today}
                stale={stale}
              />
            </div>
          </>
        )}
        <span className="h-4 w-px shrink-0 bg-subtle" aria-hidden />
        <div className="flex min-w-0 flex-1">
          <CachePill cache={cache} lastAt={usage?.lastMessageAt ?? null} loading={status === 'loading'} staleNote={staleNote} />
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          aria-expanded={open}
          aria-controls="usage-robo-drawer"
          aria-label={open ? 'Collapse usage drawer' : 'Expand usage drawer'}
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-secondary transition-colors hover:bg-panel-hover hover:text-paper"
        >
          <ChevronUp size={14} className={cn('transition-transform duration-300', open && 'rotate-180')} />
        </button>
      </div>
    </div>
  );
}

export default UsageRoboBar;
