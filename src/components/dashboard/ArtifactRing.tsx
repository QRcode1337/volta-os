'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangle, RotateCw, Search, X } from 'lucide-react';
import { OS_EVENTS } from '@/lib/events';
import { cn } from '@/lib/cn';
import { NOTE_KIND_META, copyText, matchesNote, relTime, type NoteRingItem } from './orbital/artifact-meta';
import { NoteFullscreen, NoteModal } from './orbital/ArtifactModal';
import type { ToastFn } from './orbital/OrbitalToast';

export const RING_DEFAULT_RADIUS = 235;
const NODE = 34;
const GHOST_SLOTS = 36;
const STAGE_PAD = 52; // room for ticks, degree labels and the 1.25× match scale
const BAND = 32; // half-width of the clickable "empty ring" annulus
/** Round trig output so SSR and browser serialize identical attribute strings (no hydration drift). */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Square stage edge (design px) needed for a ring of the given radius. */
export function ringStageSize(radius: number = RING_DEFAULT_RADIUS): number {
  return 2 * (radius + STAGE_PAD);
}

export type NoteRingStatus = 'loading' | 'ready' | 'error';

export interface ArtifactRingProps {
  /** Most recently edited notes, newest first (mapped by `toRingItems`). */
  items: NoteRingItem[];
  status?: NoteRingStatus;
  errorMessage?: string;
  /** Client clock (ms) for relative times — null until mounted. */
  now?: number | null;
  radius?: number;
  /** Rendered concentrically inside the ring (the Second Brain sphere). */
  center?: ReactNode;
  onToast?: ToastFn;
  onRetry?: () => void;
  reduceMotion?: boolean;
  /** Notifies the parent while a search query is filtering the ring. */
  onSearchActiveChange?: (active: boolean) => void;
  className?: string;
}

/** Inward-facing anchor for labels/tooltips so they never leave the ring's bounding box. */
function inwardAnchor(theta: number, dist: number, c: number): CSSProperties {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const x = c + dist * cos;
  const y = c + dist * sin;
  let transform: string;
  if (cos > 0.38) transform = 'translate(-100%, -50%)';
  else if (cos < -0.38) transform = 'translate(0, -50%)';
  else transform = sin > 0 ? 'translate(-50%, -100%)' : 'translate(-50%, 0)';
  return { left: r2(x), top: r2(y), transform };
}

/**
 * 36-node circular Note Ring: the most recently edited notes across the Obsidian vaults. Owns search mode
 * (SEARCH NOTES pill), the hover tooltip, the inspection modal (real markdown preview) and the fullscreen
 * reader. Renders `center` in the middle. Name kept as ArtifactRing for layout/history continuity.
 */
export function ArtifactRing({
  items,
  status = 'ready',
  errorMessage,
  now = null,
  radius = RING_DEFAULT_RADIUS,
  center,
  onToast,
  onRetry,
  reduceMotion = false,
  onSearchActiveChange,
  className,
}: ArtifactRingProps) {
  const S = ringStageSize(radius);
  const C = S / 2;
  const stageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [ringHover, setRingHover] = useState(false);

  const q = searchOpen ? query.trim() : '';
  const matchIds = useMemo(() => (q ? new Set(items.filter((a) => matchesNote(a, q)).map((a) => a.id)) : null), [items, q]);
  const matchCount = matchIds?.size ?? items.length;

  useEffect(() => {
    onSearchActiveChange?.(Boolean(q));
  }, [q, onSearchActiveChange]);

  // Focus from the commit that mounts the pill: when "/" arrives as a native window event (GlobalShortcuts →
  // focusSearch) React hasn't rendered the <input> by the next animation frame, so a rAF focus found null.
  const [focusReq, setFocusReq] = useState(0);
  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setFocusReq((n) => n + 1);
  }, []);
  useLayoutEffect(() => {
    if (focusReq === 0) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusReq]);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery('');
    inputRef.current?.blur();
  }, []);

  // Global keyboard bridge ("/" → focusSearch, Esc → escape). Esc closes the topmost layer first.
  useEffect(() => {
    const onFocus = () => openSearch();
    const onEscape = () => {
      if (reading) setReading(false);
      else if (selectedId) setSelectedId(null);
      else if (searchOpen) closeSearch();
    };
    window.addEventListener(OS_EVENTS.focusSearch, onFocus);
    window.addEventListener(OS_EVENTS.escape, onEscape);
    return () => {
      window.removeEventListener(OS_EVENTS.focusSearch, onFocus);
      window.removeEventListener(OS_EVENTS.escape, onEscape);
    };
  }, [openSearch, closeSearch, reading, selectedId, searchOpen]);

  const stagePoint = (clientX: number, clientY: number) => {
    const el = stageRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const scale = r.width / S || 1;
    const dx = (clientX - r.left) / scale - C;
    const dy = (clientY - r.top) / scale - C;
    return Math.hypot(dx, dy);
  };

  const onStageClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-ring-node],[data-ring-search],[data-ring-center],[data-ring-status]')) return;
    const d = stagePoint(e.clientX, e.clientY);
    if (d == null) return;
    if (Math.abs(d - radius) <= BAND) openSearch();
    else if (searchOpen && !query && d > radius + BAND) closeSearch();
  };

  const onStageMove = (e: React.PointerEvent) => {
    const d = stagePoint(e.clientX, e.clientY);
    const over = d != null && Math.abs(d - radius) <= BAND && !(e.target as HTMLElement).closest('[data-ring-node],[data-ring-status]');
    if (over !== ringHover) setRingHover(over);
  };

  const selectedIndex = selectedId ? items.findIndex((a) => a.id === selectedId) : -1;
  const selected = selectedIndex >= 0 ? items[selectedIndex] : null;

  // A refresh that drops the selected note closes the modal/reader instead of leaving them orphaned.
  useEffect(() => {
    if (selectedId && selectedIndex < 0) {
      setSelectedId(null);
      setReading(false);
    }
  }, [selectedId, selectedIndex]);

  const step = useCallback(
    (dir: 1 | -1) => {
      setSelectedId((id) => {
        const i = items.findIndex((a) => a.id === id);
        if (i < 0 || items.length === 0) return id;
        return items[(i + dir + items.length) % items.length].id;
      });
    },
    [items],
  );

  const copyPath = useCallback(
    async (a: NoteRingItem) => {
      try {
        await copyText(a.path);
        onToast?.(`Path copied · ${a.path}`, 'success');
      } catch {
        onToast?.('Clipboard blocked — path shown in the inspector', 'error');
      }
    },
    [onToast],
  );

  const hovered = hoveredId ? items.find((a) => a.id === hoveredId) ?? null : null;
  const showBadges = Boolean(matchIds && matchIds.size > 0 && matchIds.size <= 12);
  const trackActive = searchOpen || ringHover;
  const circ = 2 * Math.PI * radius;
  const empty = items.length === 0;

  return (
    <>
      <div
        ref={stageRef}
        className={cn('relative select-none', ringHover && 'cursor-pointer', className)}
        style={{ width: S, height: S }}
        onClick={onStageClick}
        onPointerMove={onStageMove}
        onPointerLeave={() => setRingHover(false)}
      >
        {/* ── HUD decoration ── */}
        <svg className="pointer-events-none absolute inset-0" width={S} height={S} viewBox={`0 0 ${S} ${S}`} aria-hidden>
          <defs>
            <radialGradient id="ring-halo" cx="50%" cy="50%" r="50%">
              <stop offset="58%" stopColor="#FF5500" stopOpacity="0" />
              <stop offset="80%" stopColor="#FF5500" stopOpacity={searchOpen ? 0.07 : 0.03} />
              <stop offset="100%" stopColor="#FF5500" stopOpacity="0" />
            </radialGradient>
            <filter id="ring-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>
          <circle cx={C} cy={C} r={radius + BAND + 6} fill="url(#ring-halo)" />
          <circle cx={C} cy={C} r={radius + 30} fill="none" stroke="#2A2825" strokeOpacity="0.7" strokeDasharray="1.5 6" />
          <circle cx={C} cy={C} r={radius - 30} fill="none" stroke="#1F1E1B" />
          <circle
            cx={C}
            cy={C}
            r={radius}
            fill="none"
            stroke={searchOpen ? '#FF5500' : trackActive ? '#3A3834' : '#262522'}
            strokeOpacity={searchOpen ? 0.45 : 1}
            strokeWidth={trackActive ? 1.5 : 1}
            style={{ transition: 'stroke 200ms, stroke-opacity 200ms' }}
          />
          {Array.from({ length: 72 }, (_, i) => {
            const a = (i * 5 * Math.PI) / 180;
            const major = i % 9 === 0;
            const r1 = radius + 20;
            const rr = radius + (major ? 27 : 23);
            return (
              <line
                key={i}
                x1={r2(C + r1 * Math.cos(a))}
                y1={r2(C + r1 * Math.sin(a))}
                x2={r2(C + rr * Math.cos(a))}
                y2={r2(C + rr * Math.sin(a))}
                stroke={major ? '#4A4740' : '#2A2825'}
                strokeWidth={major ? 1.2 : 1}
              />
            );
          })}
          {Array.from({ length: 8 }, (_, i) => {
            const deg = i * 45;
            const a = ((deg - 90) * Math.PI) / 180;
            const r = radius + 40;
            return (
              <text
                key={deg}
                x={r2(C + r * Math.cos(a))}
                y={r2(C + r * Math.sin(a))}
                fill="#4A4740"
                fontSize="8"
                fontFamily="JetBrains Mono, monospace"
                textAnchor="middle"
                dominantBaseline="middle"
                letterSpacing="0.08em"
              >
                {String(deg).padStart(3, '0')}
              </text>
            );
          })}
          {/* ghost slots while the ring has no notes (loading / offline / empty) */}
          {empty &&
            Array.from({ length: GHOST_SLOTS }, (_, i) => {
              const a = ((i * 10 - 90) * Math.PI) / 180;
              return (
                <circle
                  key={`g-${i}`}
                  className={cn(status === 'loading' && !reduceMotion && 'ring-ghost')}
                  style={{ animationDelay: `${(i % 12) * 90}ms` }}
                  cx={r2(C + radius * Math.cos(a))}
                  cy={r2(C + radius * Math.sin(a))}
                  r={i === 0 ? 0 : 5}
                  fill={status === 'error' ? '#2A1512' : '#1C1B19'}
                  stroke={status === 'error' ? '#5A2A22' : '#2A2825'}
                />
              );
            })}
          {/* scanning comet on the track */}
          {!reduceMotion && (
            <g className="ring-sweep" style={{ transformOrigin: `${C}px ${C}px` }}>
              {[
                [90, 0.12, 4],
                [48, 0.28, 2.5],
                [16, 0.85, 1.8],
              ].map(([len, op, w]) => (
                <circle
                  key={len}
                  cx={C}
                  cy={C}
                  r={radius}
                  fill="none"
                  stroke="#FF5500"
                  strokeOpacity={op}
                  strokeWidth={w}
                  strokeLinecap="round"
                  strokeDasharray={`${len} ${circ}`}
                  strokeDashoffset={-(90 - len)}
                  filter={len === 16 ? undefined : 'url(#ring-glow)'}
                />
              ))}
            </g>
          )}
        </svg>

        {/* ── center slot (sphere) ── */}
        <div
          data-ring-center
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[opacity,filter] duration-300"
          style={{ opacity: q ? 0.28 : 1, filter: q ? 'saturate(0.6)' : undefined }}
        >
          {center}
        </div>

        {/* ── status badge at 12 o'clock while there are no notes to show ── */}
        {empty && (
          <div data-ring-status className="absolute z-[24] -translate-x-1/2 -translate-y-1/2" style={{ left: C, top: C - radius }}>
            {status === 'loading' ? (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-subtle bg-panel-elevated/95 px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-secondary shadow-[0_6px_20px_rgba(0,0,0,0.5)]">
                <span className={cn('h-1.5 w-1.5 rounded-full bg-orange', !reduceMotion && 'animate-pulse')} />
                Loading recent notes…
              </span>
            ) : status === 'error' ? (
              <button
                type="button"
                onClick={onRetry}
                title={errorMessage}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#EF4444]/50 bg-[#1A0D0B]/95 px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[#F87171] shadow-[0_6px_20px_rgba(0,0,0,0.5)] hover:border-[#EF4444]"
              >
                <AlertTriangle size={10} /> Notes offline · <RotateCw size={10} /> retry
              </button>
            ) : (
              <span className="inline-flex whitespace-nowrap rounded-full border border-subtle bg-panel-elevated/95 px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">
                No notes found in your vaults
              </span>
            )}
          </div>
        )}

        {/* ── nodes ── */}
        {items.map((a, i) => {
          const theta = ((a.angleDeg - 90) * Math.PI) / 180;
          const x = r2(C + radius * Math.cos(theta));
          const y = r2(C + radius * Math.sin(theta));
          const meta = NOTE_KIND_META[a.kind];
          const Icon = meta.icon;
          const isMatch = matchIds ? matchIds.has(a.id) : false;
          const dim = matchIds ? !isMatch : false;
          const hot = hoveredId === a.id;
          return (
            <button
              key={a.id}
              type="button"
              data-ring-node
              aria-label={`${a.title} · ${a.tag}`}
              onClick={() => setSelectedId(a.id)}
              onPointerEnter={() => setHoveredId(a.id)}
              onPointerLeave={() => setHoveredId((h) => (h === a.id ? null : h))}
              onFocus={() => setHoveredId(a.id)}
              onBlur={() => setHoveredId((h) => (h === a.id ? null : h))}
              className={cn('ring-node absolute flex items-center justify-center rounded-full border outline-none', 'focus-visible:ring-2 focus-visible:ring-orange/60')}
              style={{
                left: x - NODE / 2,
                top: y - NODE / 2,
                width: NODE,
                height: NODE,
                zIndex: isMatch || hot ? 21 : 20,
                background: isMatch ? '#1E1209' : hot ? '#24221F' : '#141413',
                borderColor: isMatch ? '#FF5500' : hot ? '#4A4740' : '#2A2825',
                color: isMatch ? '#FF5500' : hot ? meta.color : '#A39E93',
                opacity: dim ? 0.15 : 1,
                transform: `scale(${isMatch ? 1.25 : hot ? 1.12 : 1})`,
                boxShadow: isMatch
                  ? '0 0 0 3px rgba(255,85,0,0.14), 0 0 18px rgba(255,85,0,0.55)'
                  : hot
                    ? '0 0 14px rgba(245,242,235,0.08)'
                    : '0 2px 8px rgba(0,0,0,0.45)',
                animationDelay: reduceMotion ? undefined : `${i * 16}ms`,
                animationName: reduceMotion ? 'none' : undefined,
              }}
            >
              <Icon size={14} strokeWidth={1.8} />
            </button>
          );
        })}

        {/* ── match label badges ── */}
        {showBadges &&
          items.map((a) => {
            if (!matchIds?.has(a.id) || hoveredId === a.id) return null;
            const theta = ((a.angleDeg - 90) * Math.PI) / 180;
            return (
              <span
                key={`b-${a.id}`}
                className="ring-badge pointer-events-none absolute z-[22] max-w-[132px] truncate rounded-full border border-orange/60 bg-[#1A0F08]/95 px-2 py-[3px] font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-orange shadow-[0_0_12px_rgba(255,85,0,0.25)]"
                style={inwardAnchor(theta, radius - 30, C)}
              >
                {a.title}
              </span>
            );
          })}

        {/* ── hover tooltip ── */}
        {hovered && (
          <div
            className="pointer-events-none absolute z-[23] w-max max-w-[210px] rounded-lg border border-highlight bg-panel-elevated/95 px-2.5 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur"
            style={inwardAnchor(((hovered.angleDeg - 90) * Math.PI) / 180, radius - 32, C)}
          >
            <div className="line-clamp-2 text-[12px] font-semibold leading-tight text-paper">{hovered.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 font-mono text-[9px] uppercase tracking-[0.08em]">
              <span className="text-orange">{hovered.tag}</span>
              <span className="text-muted">·</span>
              <span style={{ color: NOTE_KIND_META[hovered.kind].color }}>{NOTE_KIND_META[hovered.kind].label}</span>
            </div>
            {now !== null && <div className="mt-0.5 font-mono text-[9px] text-muted">edited {relTime(hovered.mtime, now)}</div>}
          </div>
        )}

        {/* ── search pill ── */}
        {searchOpen && (
          <div data-ring-search className="ring-search absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
            <label className="flex h-11 w-[268px] items-center gap-2.5 rounded-full border border-orange/55 bg-panel-elevated/90 px-4 shadow-[0_0_0_4px_rgba(255,85,0,0.08),0_16px_50px_rgba(0,0,0,0.65)] backdrop-blur-md">
              <Search size={15} className="shrink-0 text-orange" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                    closeSearch();
                  } else if (e.key === 'Enter' && matchIds && matchIds.size > 0) {
                    const first = items.find((a) => matchIds.has(a.id));
                    if (first) setSelectedId(first.id);
                  }
                }}
                placeholder="SEARCH NOTES"
                spellCheck={false}
                autoComplete="off"
                aria-label="Search notes"
                className="min-w-0 flex-1 bg-transparent font-mono text-[12px] font-medium uppercase tracking-[0.12em] text-paper outline-none placeholder:text-muted"
              />
              <button type="button" onClick={closeSearch} aria-label="Close search" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel-hover hover:text-paper">
                <X size={13} />
              </button>
            </label>
            <span className={cn('rounded-full bg-black/50 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]', q && matchCount === 0 ? 'text-[#EF4444]' : 'text-secondary')}>
              {empty
                ? status === 'loading'
                  ? 'Notes still loading…'
                  : 'No notes to search'
                : q
                  ? matchCount === 0
                    ? 'No matches'
                    : `${matchCount} of ${items.length} match${matchCount === 1 ? '' : 'es'}`
                  : `${items.length} recent notes · title / vault / folder`}
            </span>
          </div>
        )}

        <style>{`
          @keyframes ring-node-in { from { opacity: 0; transform: scale(0.4); } }
          .ring-node {
            animation: ring-node-in 420ms cubic-bezier(.2,.8,.2,1) backwards;
            transition: transform 260ms cubic-bezier(.2,.8,.2,1), opacity 260ms ease, border-color 200ms, background 200ms, color 200ms, box-shadow 260ms;
          }
          @keyframes ring-sweep { to { transform: rotate(360deg); } }
          .ring-sweep { animation: ring-sweep 16s linear infinite; }
          @keyframes ring-pop { from { opacity: 0; transform: scale(0.92); } }
          .ring-search { animation: ring-pop 220ms cubic-bezier(.2,.8,.2,1) both; }
          @keyframes ring-badge-in { from { opacity: 0; } }
          .ring-badge { animation: ring-badge-in 200ms ease-out both; }
          @keyframes ring-ghost { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
          .ring-ghost { animation: ring-ghost 1.4s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) {
            .ring-node, .ring-search, .ring-badge, .ring-ghost { animation: none; }
            .ring-sweep { animation: none; }
          }
        `}</style>
      </div>

      {selected && (
        <NoteModal
          item={selected}
          index={selectedIndex}
          total={items.length}
          now={now}
          onClose={() => setSelectedId(null)}
          onStep={step}
          onExpand={() => setReading(true)}
          onCopyPath={() => void copyPath(selected)}
        />
      )}
      {selected && reading && <NoteFullscreen item={selected} onClose={() => setReading(false)} onStep={step} onCopyPath={() => void copyPath(selected)} />}
    </>
  );
}

export default ArtifactRing;
