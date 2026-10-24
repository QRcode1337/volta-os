'use client';
import { useMemo, useRef, useState } from 'react';
import type { LtmCaptureSummary, LtmSessionNote } from '@/types/ltm';
import { cn } from '@/lib/cn';
import { appColor, hhmm, secondsOfDay } from './ltm-client';

interface DayTimelineProps {
  captures: LtmCaptureSummary[]; // the whole day, any order
  sessions: LtmSessionNote[];
  selectedId: number | null;
  appFilter: string | null;
  onSelect: (id: number) => void;
  onToggleApp: (app: string) => void;
}

const MAX_ROWS = 8;
const LABEL_W = 92;

/** 24h swimlane chart: one lane per top app, a tick per capture, session bands on top. */
export function DayTimeline({ captures, sessions, selectedId, appFilter, onSelect, onToggleApp }: DayTimelineProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ c: LtmCaptureSummary; x: number; y: number } | null>(null);

  const { lanes, byId, span } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of captures) counts.set(c.app, (counts.get(c.app) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const laneApps = top.slice(0, MAX_ROWS).map(([app, n]) => ({ app, n }));
    const otherCount = top.slice(MAX_ROWS).reduce((s, [, n]) => s + n, 0);
    const lanes = [...laneApps, ...(otherCount ? [{ app: 'Other', n: otherCount }] : [])];
    const byId = new Map(captures.map((c) => [c.id, c]));
    // Zoom the x axis to the active hours (with an hour of padding), min 6h.
    let lo = 24 * 3600;
    let hi = 0;
    for (const c of captures) {
      const s = secondsOfDay(c.ts);
      lo = Math.min(lo, s);
      hi = Math.max(hi, s);
    }
    if (!captures.length) {
      lo = 0;
      hi = 24 * 3600;
    }
    let start = Math.max(0, Math.floor(lo / 3600) * 3600 - 1800);
    let end = Math.min(24 * 3600, Math.ceil(hi / 3600) * 3600 + 1800);
    if (end - start < 6 * 3600) {
      const mid = (start + end) / 2;
      start = Math.max(0, mid - 3 * 3600);
      end = Math.min(24 * 3600, start + 6 * 3600);
    }
    return { lanes, byId, span: { start, end } };
  }, [captures]);

  const laneFor = (app: string) => {
    const i = lanes.findIndex((l) => l.app === app);
    return i >= 0 ? i : lanes.length - 1;
  };
  const xPct = (sec: number) => ((sec - span.start) / (span.end - span.start)) * 100;
  const spanHours = (span.end - span.start) / 3600;
  const step = spanHours > 14 ? 3 : spanHours > 8 ? 2 : 1;
  const hours: number[] = [];
  for (let h = Math.ceil(span.start / 3600); h <= Math.floor(span.end / 3600); h++) if (h % step === 0) hours.push(h);

  const laneH = 18;
  const bandH = 16;

  const sessionBands = sessions
    .map((s) => {
      const a = s.captureFrom != null ? byId.get(s.captureFrom) : undefined;
      const b = s.captureTo != null ? byId.get(s.captureTo) : undefined;
      if (!a || !b) return null;
      return { s, x0: xPct(secondsOfDay(a.ts)), x1: xPct(secondsOfDay(b.ts)) };
    })
    .filter(Boolean) as { s: LtmSessionNote; x0: number; x1: number }[];

  return (
    <div className="relative select-none" ref={wrapRef}>
      {/* Hour ruler */}
      <div className="relative h-5" style={{ marginLeft: LABEL_W }}>
        {hours.map((h) => (
          <span
            key={h}
            className="absolute -translate-x-1/2 font-mono text-[9px] text-muted"
            style={{ left: `${xPct(h * 3600)}%` }}
          >
            {String(h).padStart(2, '0')}:00
          </span>
        ))}
      </div>

      {/* Session bands */}
      <div className="relative" style={{ marginLeft: LABEL_W, height: bandH }}>
        {sessionBands.map(({ s, x0, x1 }) => (
          <a
            key={s.file}
            href={s.obsidianUrl ?? undefined}
            title={`${s.title}${s.tldr ? `\n\n${s.tldr}` : ''}`}
            className="absolute top-1 h-2.5 rounded-sm bg-purple/50 ring-1 ring-purple/60 transition-colors hover:bg-purple"
            style={{ left: `${x0}%`, width: `max(4px, ${x1 - x0}%)` }}
          />
        ))}
        <span className="absolute -left-[92px] top-0.5 w-[86px] truncate text-right font-mono text-[9px] uppercase text-purple/80">
          Vault notes
        </span>
      </div>

      {/* Lanes */}
      <div className="relative">
        {/* gridlines */}
        <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: LABEL_W }}>
          {hours.map((h) => (
            <span key={h} className="absolute inset-y-0 w-px bg-subtle/60" style={{ left: `${xPct(h * 3600)}%` }} />
          ))}
        </div>
        {lanes.map((l) => {
          const muted = appFilter != null && appFilter !== l.app;
          return (
            <div key={l.app} className="relative flex items-center" style={{ height: laneH }}>
              <button
                type="button"
                onClick={() => l.app !== 'Other' && onToggleApp(l.app)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 truncate pr-2 text-right text-[11px] transition-opacity',
                  muted ? 'opacity-35 hover:opacity-80' : 'text-secondary hover:text-paper',
                )}
                style={{ width: LABEL_W }}
                title={`${l.app} · ${l.n} captures${l.app !== 'Other' ? ' — click to filter' : ''}`}
              >
                <span className="ml-auto truncate">{l.app}</span>
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: l.app === 'Other' ? '#3A3834' : appColor(l.app) }} />
              </button>
              <div className="relative h-full flex-1 border-b border-subtle/40" />
            </div>
          );
        })}
        {/* ticks */}
        <div className="absolute inset-y-0 right-0" style={{ left: LABEL_W }}>
          {captures.map((c) => {
            const lane = laneFor(c.app);
            const sel = c.id === selectedId;
            const muted = appFilter != null && appFilter !== c.app;
            return (
              <button
                key={c.id}
                type="button"
                aria-label={`${hhmm(c.ts)} ${c.app}`}
                onClick={() => onSelect(c.id)}
                onMouseEnter={(e) => {
                  const r = wrapRef.current?.getBoundingClientRect();
                  if (r) setHover({ c, x: e.clientX - r.left, y: e.clientY - r.top });
                }}
                onMouseLeave={() => setHover(null)}
                className={cn(
                  'absolute w-[3px] -translate-x-1/2 rounded-[1px] transition-transform hover:scale-y-125',
                  sel && 'z-10 w-[5px] ring-2 ring-paper',
                  muted && 'opacity-15',
                )}
                style={{
                  left: `${xPct(secondsOfDay(c.ts))}%`,
                  top: lane * laneH + 3,
                  height: laneH - 6,
                  background: lane >= MAX_ROWS ? '#6E6A61' : appColor(c.app),
                }}
              />
            );
          })}
        </div>
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute z-30 max-w-[320px] -translate-x-1/2 rounded-md border border-highlight bg-panel-elevated px-2.5 py-1.5 shadow-xl"
          style={{ left: hover.x, top: hover.y + 14 }}
        >
          <div className="font-mono text-[10px] text-orange">
            {hhmm(hover.c.ts)} · {hover.c.app}
          </div>
          <div className="truncate text-[11px] text-paper">{hover.c.title || '(no window title)'}</div>
        </div>
      )}
    </div>
  );
}
