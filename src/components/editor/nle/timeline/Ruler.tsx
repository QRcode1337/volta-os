'use client';
// VOLTA Editor — Edit mode timeline: ruler (adaptive ticks, only the visible window) and marker flags.
import { memo, useEffect, useState, type RefObject } from 'react';
import { fmtTC } from '@/lib/nle/model';
import type { NleMarker } from '@/types/nle';
import { HEADER_W, RULER_H, hms, pickSteps } from './constants';

interface RulerProps {
  pps: number;
  fps: number;
  markers: NleMarker[];
  scrollEl: RefObject<HTMLDivElement | null>;
  editingMarker: string | null;
  onRenameMarker: (id: string, label: string | null) => void;
}

export const Ruler = memo(function Ruler({ pps, fps, markers, scrollEl, editingMarker, onRenameMarker }: RulerProps) {
  const [win, setWin] = useState({ left: 0, width: 1600 });
  useEffect(() => {
    const el = scrollEl.current;
    if (!el) return;
    let raf = 0;
    const upd = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setWin((w) => (w.left === el.scrollLeft && w.width === el.clientWidth - HEADER_W ? w : { left: el.scrollLeft, width: el.clientWidth - HEADER_W })));
    };
    upd();
    el.addEventListener('scroll', upd, { passive: true });
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', upd);
      ro.disconnect();
    };
  }, [scrollEl]);

  const { major, sub } = pickSteps(pps, fps);
  const minor = major / sub;
  const x0 = Math.max(0, win.left - 40);
  const x1 = win.left + Math.max(200, win.width) + 40;
  const t0 = x0 / pps;
  const t1 = x1 / pps;
  const labels: { t: number; x: number }[] = [];
  for (let k = Math.floor(t0 / major); k * major <= t1; k++) labels.push({ t: k * major, x: k * major * pps });
  let path = '';
  for (const l of labels) path += `M${(l.x - x0).toFixed(1)} ${RULER_H - 12}V${RULER_H}`;
  let minorPath = '';
  if (sub > 1 && minor * pps >= 6) {
    for (let k = Math.floor(t0 / minor); k * minor <= t1; k++) {
      if (k % sub === 0) continue;
      const x = k * minor * pps - x0;
      minorPath += `M${x.toFixed(1)} ${RULER_H - 5}V${RULER_H}`;
    }
  }
  const label = (t: number) => (major < 1 ? fmtTC(t, fps) : hms(t));

  return (
    <>
      <svg className="pointer-events-none absolute top-0" style={{ left: x0, width: x1 - x0, height: RULER_H }}>
        <path d={minorPath} stroke="var(--border-highlight)" strokeWidth={1} />
        <path d={path} stroke="var(--text-muted)" strokeWidth={1} />
      </svg>
      {labels.map((l) => (
        <span key={l.t} className="pointer-events-none absolute top-[3px] pl-1 font-mono text-[9px] leading-none text-muted" style={{ left: l.x }}>
          {label(l.t)}
        </span>
      ))}
      {markers.map((m) => (
        <div key={m.id} data-hit="marker" data-id={m.id} className="group absolute bottom-0 z-[3] flex cursor-ew-resize items-end" style={{ left: m.t * pps }} title={`${m.label} · drag to move · double-click to rename · right-click / ⌥-click to delete`}>
          <svg width={10} height={13} className="block -translate-x-[1px]">
            <path d="M1 0V13M1 1H9L7 4L9 7H1" fill={m.color} stroke={m.color} strokeWidth={1.4} strokeLinejoin="round" />
          </svg>
          {editingMarker === m.id ? (
            <input
              autoFocus
              defaultValue={m.label}
              className="mb-[1px] ml-0.5 h-[15px] w-28 rounded-[3px] border border-orange bg-obsidian px-1 font-mono text-[9.5px] text-paper outline-none"
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') onRenameMarker(m.id, e.currentTarget.value);
                if (e.key === 'Escape') onRenameMarker(m.id, null);
              }}
              onBlur={(e) => onRenameMarker(m.id, e.currentTarget.value)}
            />
          ) : (
            <span className="mb-[2px] ml-0.5 max-w-[110px] truncate font-mono text-[9px] leading-none" style={{ color: m.color }}>
              {m.label}
            </span>
          )}
        </div>
      ))}
    </>
  );
});
