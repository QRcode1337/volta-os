'use client';
// Second Brain → Timeline: real unvolta-ltm screen-capture activity per app per day (/api/ltm/days).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, ExternalLink } from 'lucide-react';
import type { BrainNode } from '@/types/os';
import type { LtmDay } from '@/types/ltm';
import { appColor, dayLabel } from '@/components/ltm/ltm-client';
import { formatInt } from '@/lib/format';
import { HeaderStat, ViewState, apiGate, matchesQuery, useApi, useNow } from './analytics-shared';
import type { LtmBadge } from './graph-data';

interface TimelineProps {
  /** Legacy props from SecondBrainApp — accepted, ignored (the timeline now reads real LTM data). */
  nodes?: BrainNode[];
  query?: string;
  onSelectNode?: (id: string) => void;
  /** SecondBrainApp's shared /api/ltm/status poll (the header badge); the all-time APPS stat is read from it. */
  ltm?: LtmBadge;
}

/** Local calendar date (yyyy-mm-dd) of an epoch-ms clock — same format as the LTM day keys. */
function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const LANE_APPS = 9;
const OTHER = 'Other';
const OTHER_COLOR = '#6E6A61';
const LANE_LABEL_W = 140;
const HEADER_H = 46;
const FOOTER_H = 30;
const MONTH_UPPER = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

interface Column {
  date: string;
  dow: number; // 0 = Sunday (UTC arithmetic on the date string, no zone drift)
  dom: number;
  month: number; // 1..12
  year: number;
  total: number; // all captures that day (0 = gap)
  counts: Map<string, number>; // lane → captures
}

/** Hovered / focused cell. `lane` null = the column's daily-total footer cell. Pointer x/y live in a ref. */
interface Hover {
  col: number;
  lane: string | null;
}
const sameHover = (a: Hover | null, b: Hover | null) => a === b || (!!a && !!b && a.col === b.col && a.lane === b.lane);

/** Every yyyy-mm-dd from `first` to `last` inclusive (pure UTC arithmetic). */
function dateRange(first: string, last: string): string[] {
  const [y0, m0, d0] = first.split('-').map(Number);
  const [y1, m1, d1] = last.split('-').map(Number);
  const start = Date.UTC(y0, m0 - 1, d0);
  const end = Date.UTC(y1, m1 - 1, d1);
  const out: string[] = [];
  for (let t = start; t <= end && out.length < 800; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function TimelineView({ query = '', ltm }: TimelineProps) {
  const router = useRouter();
  const daysApi = useApi<{ days: LtmDay[] }>('/api/ltm/days?top=40', 60_000);

  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: 0, y: 0 }); // last pointer / focus position (host-relative px) — no re-render per move
  const [size, setSize] = useState({ w: 1200, h: 600 });
  const [hover, setHover] = useState<Hover | null>(null);
  // Post-mount clock (paused while the tab is hidden) → hydration-safe "today" marker.
  const nowMs = useNow();
  const today = nowMs === null ? null : localDate(nowMs);

  const hasData = !!daysApi.data?.days.length;
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.max(640, el.clientWidth);
      const h = Math.max(360, el.clientHeight);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [hasData]);

  // ── Derive lanes + columns from the per-day top-app lists ──
  const model = useMemo(() => {
    const days = [...(daysApi.data?.days ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    if (!days.length) return null;
    const appTotals = new Map<string, number>();
    for (const d of days) for (const a of d.apps) appTotals.set(a.app, (appTotals.get(a.app) ?? 0) + a.count);
    const topApps = [...appTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, LANE_APPS)
      .map(([app]) => app);
    const top = new Set(topApps);
    const lanes = [...topApps, OTHER];

    const byDate = new Map(days.map((d) => [d.date, d]));
    const laneTotals = new Map<string, number>(lanes.map((l) => [l, 0]));
    const columns: Column[] = dateRange(days[0].date, days[days.length - 1].date).map((date) => {
      const [year, month, dom] = date.split('-').map(Number);
      const dow = new Date(Date.UTC(year, month - 1, dom)).getUTCDay();
      const d = byDate.get(date);
      const counts = new Map<string, number>();
      if (d) {
        let inTop = 0;
        for (const a of d.apps) {
          if (top.has(a.app)) {
            counts.set(a.app, a.count);
            inTop += a.count;
          }
        }
        // "Other" = everything outside the top-9 lanes, including apps beyond the API's per-day top-40 list.
        const other = Math.max(0, d.count - inTop);
        if (other) counts.set(OTHER, other);
        for (const [lane, c] of counts) laneTotals.set(lane, (laneTotals.get(lane) ?? 0) + c);
      }
      return { date, dow, dom, month, year, total: d?.count ?? 0, counts };
    });

    let maxCell = 1;
    for (const c of columns) for (const v of c.counts.values()) maxCell = Math.max(maxCell, v);
    const maxDay = Math.max(1, ...columns.map((c) => c.total));
    const busiest = columns.reduce((best, c, i) => (c.total > columns[best].total ? i : best), 0);
    const captures = columns.reduce((a, c) => a + c.total, 0);
    const activeDays = columns.filter((c) => c.total > 0).length;

    // Month bands (consecutive columns sharing a month).
    const months: { key: string; label: string; start: number; span: number }[] = [];
    columns.forEach((c, i) => {
      const key = `${c.year}-${c.month}`;
      const last = months[months.length - 1];
      if (last && last.key === key) last.span += 1;
      else months.push({ key, label: `${MONTH_UPPER[c.month - 1]} ${c.year}`, start: i, span: 1 });
    });

    return { lanes, columns, laneTotals, maxCell, maxDay, busiest, captures, activeDays, distinctApps: appTotals.size, months };
  }, [daysApi.data]);

  const gate = apiGate(daysApi, { loading: 'LOADING LTM ACTIVITY…', error: 'LTM ACTIVITY UNAVAILABLE', offline: 'LTM OFFLINE' });

  // ── Geometry ──
  const nCols = model?.columns.length ?? 1;
  const nLanes = model?.lanes.length ?? 1;
  const plotW = size.w - LANE_LABEL_W - 16;
  const plotH = size.h - HEADER_H - FOOTER_H - 6;
  const laneH = plotH / nLanes;
  const dayW = plotW / nCols;
  const barW = Math.max(2, Math.min(24, dayW * 0.62));
  const x = useCallback((i: number) => LANE_LABEL_W + i * dayW, [dayW]);
  const barH = useCallback((v: number) => (model ? Math.max(2, Math.sqrt(v / model.maxCell) * (laneH - 12)) : 0), [model, laneH]);
  const todayIdx = model && today ? model.columns.findIndex((c) => c.date === today) : -1;
  const showEveryDay = dayW >= 22;
  const footerY = HEADER_H + plotH + 2;
  const footerBarH = useCallback((total: number) => (model ? (total / model.maxDay) * (FOOTER_H - 12) : 0), [model]);

  const openDay = useCallback((date: string) => router.push(`/apps/ltm?date=${date}`), [router]);

  /** Position the tooltip imperatively from posRef (pointer moves never re-render the SVG). */
  const placeTip = useCallback(() => {
    const el = tipRef.current;
    if (!el) return;
    const { x: px, y: py } = posRef.current;
    el.style.left = `${Math.min(px + 14, size.w - 246)}px`;
    el.style.top = `${Math.max(8, py - 96)}px`;
  }, [size.w]);
  useLayoutEffect(() => {
    if (hover) placeTip();
  }, [hover, placeTip]);

  /** Host-relative point → the cell under it (only cells with captures, or a footer day with captures). */
  const locate = (mx: number, my: number): Hover | null => {
    if (!model || mx < LANE_LABEL_W || mx >= LANE_LABEL_W + plotW) return null;
    const col = Math.floor((mx - LANE_LABEL_W) / dayW);
    const c = model.columns[col];
    if (!c) return null;
    if (my >= HEADER_H && my < HEADER_H + plotH) {
      const lane = model.lanes[Math.floor((my - HEADER_H) / laneH)];
      return lane && c.counts.get(lane) ? { col, lane } : null;
    }
    if (my >= footerY && my < footerY + FOOTER_H) return c.total ? { col, lane: null } : null;
    return null;
  };
  const pointer = (e: MouseEvent) => {
    const rect = hostRef.current!.getBoundingClientRect();
    return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
  };
  const onMove = (e: MouseEvent) => {
    const { mx, my } = pointer(e);
    posRef.current = { x: mx, y: my };
    const hit = locate(mx, my);
    setHover((prev) => (sameHover(prev, hit) ? prev : hit));
    placeTip();
    if (svgRef.current) svgRef.current.style.cursor = hit ? 'pointer' : 'default';
  };
  const onClick = (e: MouseEvent) => {
    const { mx, my } = pointer(e);
    const hit = locate(mx, my);
    if (hit && model) openDay(model.columns[hit.col].date);
  };

  const laneColor = (lane: string) => (lane === OTHER ? OTHER_COLOR : appColor(lane));

  // ── Static layer (bands, ticks, lanes, bars, focusable day totals) — memoised so hover only redraws the overlay ──
  const staticLayer = useMemo(() => {
    if (!model) return null;
    const colorOf = (lane: string) => (lane === OTHER ? OTHER_COLOR : appColor(lane));
    const focusDay = (i: number) => {
      posRef.current = { x: x(i) + dayW / 2, y: footerY };
      setHover({ col: i, lane: null });
    };
    const keyDay = (e: KeyboardEvent, date: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDay(date);
      }
    };
    return (
      <>
        <defs>
          <pattern id="sb-tl-gap" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#262522" strokeWidth="2" />
          </pattern>
        </defs>

        {/* Month bands */}
        {model.months.map((m, mi) => (
          <g key={m.key}>
            <rect x={x(m.start)} y={0} width={m.span * dayW} height={HEADER_H - 22} fill={mi % 2 ? '#1C1B19' : '#141413'} />
            <text x={x(m.start) + 8} y={16} fill="#F5F2EB" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.16em' }}>
              {m.span * dayW > 90 ? m.label : m.label.slice(0, 3)}
            </text>
            <line x1={x(m.start)} x2={x(m.start)} y1={0} y2={HEADER_H + plotH} stroke="#3A3834" strokeWidth={1.2} />
          </g>
        ))}

        {/* Day / week ticks */}
        {model.columns.map((c, i) => {
          const monday = c.dow === 1;
          if (!showEveryDay && !monday) return null;
          return (
            <g key={c.date}>
              {monday && i > 0 && <line x1={x(i)} x2={x(i)} y1={HEADER_H - 20} y2={HEADER_H + plotH} stroke="#3A3834" strokeDasharray="2 3" />}
              <text
                x={x(i) + dayW / 2}
                y={HEADER_H - 8}
                textAnchor="middle"
                fill={i === todayIdx ? '#FF5500' : monday ? '#A39E93' : '#6E6A61'}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: monday ? 600 : 400 }}
              >
                {showEveryDay && dayW >= 40 ? `${'SMTWTFS'[c.dow]} ${c.dom}` : c.dom}
              </text>
            </g>
          );
        })}

        {/* Gap days (no captures at all) */}
        {model.columns.map((c, i) =>
          c.total === 0 ? <rect key={`gap-${c.date}`} x={x(i)} y={HEADER_H} width={dayW} height={plotH} fill="url(#sb-tl-gap)" opacity={0.6} /> : null,
        )}

        {/* Lanes */}
        {model.lanes.map((lane, li) => {
          const y0 = HEADER_H + li * laneH;
          const color = colorOf(lane);
          const dim = !matchesQuery(query, lane);
          return (
            <g key={lane} opacity={dim ? 0.3 : 1} style={{ transition: 'opacity 200ms' }}>
              <rect x={LANE_LABEL_W} y={y0} width={plotW} height={laneH} fill={li % 2 ? 'rgba(255,255,255,0.012)' : 'transparent'} />
              <line x1={LANE_LABEL_W} x2={LANE_LABEL_W + plotW} y1={y0 + laneH} y2={y0 + laneH} stroke="#262522" />
              <circle cx={12} cy={y0 + laneH / 2} r={4} fill={color} style={{ filter: lane === OTHER ? undefined : `drop-shadow(0 0 4px ${color})` }} />
              <text x={24} y={y0 + laneH / 2 - 4} dominantBaseline="middle" fill="#F5F2EB" style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600 }}>
                {lane.length > 16 ? `${lane.slice(0, 15)}…` : lane}
              </text>
              <text x={24} y={y0 + laneH / 2 + 10} dominantBaseline="middle" fill="#6E6A61" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                {formatInt(model.laneTotals.get(lane) ?? 0)} captures
              </text>
              {model.columns.map((c, i) => {
                const v = c.counts.get(lane) ?? 0;
                if (!v) return null;
                const bh = barH(v);
                return (
                  <rect
                    key={c.date}
                    x={x(i) + (dayW - barW) / 2}
                    y={y0 + laneH - 4 - bh}
                    width={barW}
                    height={bh}
                    rx={Math.min(2, barW / 3)}
                    fill={color}
                    fillOpacity={0.72}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Today marker */}
        {todayIdx >= 0 && (
          <line
            x1={x(todayIdx) + dayW / 2}
            x2={x(todayIdx) + dayW / 2}
            y1={HEADER_H - 20}
            y2={HEADER_H + plotH}
            stroke="#FF5500"
            strokeWidth={1.2}
            strokeOpacity={0.8}
            pointerEvents="none"
          />
        )}

        {/* Daily totals along the footer — the keyboard path into LTM (Tab, then Enter / Space) */}
        {model.columns.map((c, i) => {
          const h = footerBarH(c.total);
          const label = `${dayLabel(c.date).label} · ${formatInt(c.total)} captures`;
          return (
            <g
              key={`tot-${c.date}`}
              className="outline-none [&:focus-visible>rect:first-child]:stroke-orange"
              {...(c.total
                ? {
                    tabIndex: 0,
                    role: 'button',
                    'aria-label': `${label} · open in LTM`,
                    onKeyDown: (e: KeyboardEvent) => keyDay(e, c.date),
                    onFocus: () => focusDay(i),
                    onBlur: () => setHover((hv) => (hv?.col === i && hv.lane === null ? null : hv)),
                  }
                : {})}
            >
              <rect x={x(i) + 1} y={footerY} width={Math.max(0, dayW - 2)} height={FOOTER_H - 2} rx={3} fill="transparent" stroke="transparent" strokeWidth={1.2} />
              <rect
                x={x(i) + (dayW - barW) / 2}
                y={footerY + FOOTER_H - 6 - h}
                width={barW}
                height={Math.max(c.total ? 1.5 : 0, h)}
                fill={i === todayIdx ? '#FF5500' : '#6E6A61'}
                opacity={0.55}
              />
            </g>
          );
        })}
        <text x={LANE_LABEL_W - 10} y={HEADER_H + plotH + FOOTER_H - 6} textAnchor="end" fill="#6E6A61" style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>
          DAILY TOTAL
        </text>
      </>
    );
  }, [model, query, todayIdx, openDay, x, barH, footerBarH, dayW, laneH, plotW, plotH, barW, showEveryDay, footerY]);

  const hoverCol = hover && model ? model.columns[hover.col] : null;
  const hoverCount = hover && hoverCol ? (hover.lane ? (hoverCol.counts.get(hover.lane) ?? 0) : hoverCol.total) : 0;
  const hoverTop = useMemo(() => {
    if (!hoverCol || hover?.lane) return null;
    let best: [string, number] | null = null;
    for (const [lane, v] of hoverCol.counts) if (lane !== OTHER && (!best || v > best[1])) best = [lane, v];
    return best;
  }, [hoverCol, hover?.lane]);
  // APPS = distinct apps across all captures (status). If status is unavailable, fall back to the apps named in the
  // per-day top-40 lists, which is a lower bound — labelled as such in the tooltip.
  const appsStat =
    ltm?.status === 'ok'
      ? { value: formatInt(ltm.apps), title: 'Distinct apps across every LTM capture (all time)' }
      : ltm?.status === 'offline' && model
        ? { value: `≥${formatInt(model.distinctApps)}`, title: `LTM status unavailable (${ltm.reason}) — counting apps in the per-day top-40 lists only` }
        : { value: '—', title: undefined };

  // ── Hover overlay: the only SVG nodes that change while the pointer moves ──
  let overlay: ReactNode = null;
  if (hover && hoverCol && model) {
    const i = hover.col;
    const fh = footerBarH(hoverCol.total);
    const footerBar = (
      <rect
        x={x(i) + (dayW - barW) / 2}
        y={footerY + FOOTER_H - 6 - fh}
        width={barW}
        height={Math.max(1.5, fh)}
        fill={i === todayIdx ? '#FF5500' : '#A39E93'}
        opacity={0.95}
      />
    );
    if (hover.lane) {
      const li = model.lanes.indexOf(hover.lane);
      const y0 = HEADER_H + li * laneH;
      const color = laneColor(hover.lane);
      const bh = barH(hoverCount);
      const bx = x(i) + (dayW - barW) / 2;
      overlay = (
        <g pointerEvents="none">
          <rect x={bx} y={y0 + laneH - 4 - bh} width={barW} height={bh} rx={Math.min(2, barW / 3)} fill={color} />
          <rect x={bx - 2} y={y0 + 2} width={barW + 4} height={laneH - 4} fill="none" stroke={color} strokeOpacity={0.7} rx={2} />
          {footerBar}
        </g>
      );
    } else {
      overlay = (
        <g pointerEvents="none">
          <rect x={x(i) + 1} y={footerY} width={Math.max(0, dayW - 2)} height={FOOTER_H - 2} rx={3} fill="none" stroke="#FF5500" strokeOpacity={0.6} />
          {footerBar}
        </g>
      );
    }
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Summary strip */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-1 border-b border-subtle px-5 py-2.5">
        <div className="flex items-center gap-2">
          <CalendarDays size={14} className="text-orange" />
          <span className="hud-label">
            SCREEN ACTIVITY · UNVOLTA LTM
            {model && ` · ${dayLabel(model.columns[0].date).label.toUpperCase()} → ${dayLabel(model.columns[model.columns.length - 1].date).label.toUpperCase()}`}
          </span>
        </div>
        {model && (
          <>
            <HeaderStat label="DAYS" value={model.activeDays === model.columns.length ? formatInt(model.activeDays) : `${model.activeDays}/${model.columns.length}`} />
            <HeaderStat label="CAPTURES" value={formatInt(model.captures)} />
            <HeaderStat label="APPS" value={appsStat.value} title={appsStat.title} />
            <HeaderStat
              label="BUSIEST"
              value={`${dayLabel(model.columns[model.busiest].date).label} · ${formatInt(model.columns[model.busiest].total)}`}
              tone="muted"
            />
          </>
        )}
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-muted">
          {daysApi.error && daysApi.data ? <span className="text-amber">refresh failed · showing last data</span> : 'Bar height ∝ √captures · click a day (or Tab to a daily total) to open it in LTM'}
        </span>
      </div>

      {gate ? (
        <div className="min-h-0 flex-1">{gate}</div>
      ) : !model ? (
        <div className="min-h-0 flex-1">
          <ViewState kind="empty" title="NO CAPTURES YET" detail="unvolta-ltm hasn't recorded any screen captures. Start the ltm-daemon and they'll appear here." />
        </div>
      ) : (
        <div ref={hostRef} className="relative min-h-0 flex-1 px-2" onMouseLeave={() => setHover(null)}>
          <svg
            ref={svgRef}
            width={size.w}
            height={size.h}
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${size.w} ${size.h}`}
            onMouseMove={onMove}
            onClick={onClick}
          >
            {staticLayer}
            {overlay}
          </svg>

          {/* Hover / focus tooltip (positioned imperatively by placeTip) */}
          {hover && hoverCol && (
            <div ref={tipRef} className="pointer-events-none absolute z-20 w-[230px] rounded-lg border border-subtle bg-panel-elevated/95 p-2.5 shadow-xl shadow-black/50 backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: hover.lane ? laneColor(hover.lane) : '#A39E93' }} />
                <span className="truncate font-mono text-[10px] font-semibold tracking-widest text-secondary">
                  {dayLabel(hoverCol.date).label} · {hover.lane ?? 'All apps'}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">{dayLabel(hoverCol.date).dow}</span>
              </div>
              <div className="mt-1 font-doto text-[22px] font-bold text-paper">
                {formatInt(hoverCount)} <span className="font-mono text-[10px] font-normal text-muted">captures</span>
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-secondary">
                {hover.lane ? (
                  <>
                    {hoverCol.total ? Math.round((hoverCount / hoverCol.total) * 100) : 0}% of {formatInt(hoverCol.total)} that day
                    {hover.lane === OTHER && ' · apps outside the top 9'}
                  </>
                ) : hoverTop ? (
                  <>
                    top app {hoverTop[0]} · {formatInt(hoverTop[1])}
                  </>
                ) : (
                  'daily total'
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-1 font-mono text-[9.5px] text-orange">
                <ExternalLink size={10} /> {hover.lane ? 'Click' : 'Click or Enter'} to open {dayLabel(hoverCol.date).label} in LTM
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TimelineView;
