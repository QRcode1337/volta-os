'use client';
// VOLTA Editor — Edit mode timeline: the playhead. Small components that are the only things re-rendering on each tick.
import { useEffect, useRef, type RefObject } from 'react';
import { fmtTC } from '@/lib/nle/model';
import { HEADER_W } from './constants';

/** Vertical line through the lanes. Keeps the playhead in view (page-turns while playing). */
export function PlayheadLine({ t, pps, playing, scrollEl, suspendFollow }: { t: number; pps: number; playing: boolean; scrollEl: RefObject<HTMLDivElement | null>; suspendFollow: boolean }) {
  const x = t * pps;
  const xRef = useRef(x);
  xRef.current = x;
  useEffect(() => {
    const el = scrollEl.current;
    if (!el || suspendFollow) return;
    const px = xRef.current;
    const viewW = el.clientWidth - HEADER_W;
    const left = el.scrollLeft;
    if (playing) {
      if (px > left + viewW - 40 || px < left) el.scrollLeft = Math.max(0, px - viewW * 0.1);
    } else if (px < left || px > left + viewW - 8) el.scrollLeft = Math.max(0, px - viewW / 2);
    // only when the playhead moves (not on zoom / manual scroll)
  }, [t, playing]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="pointer-events-none absolute bottom-0 top-0 z-[8]" style={{ left: x }}>
      <div className="absolute bottom-0 top-0 -left-[0.5px] w-px bg-orange shadow-[0_0_6px_#FF5500]" />
    </div>
  );
}

/** Draggable head in the ruler. */
export function PlayheadHead({ t, pps }: { t: number; pps: number }) {
  return (
    <div data-hit="playhead" className="absolute bottom-0 top-0 z-[5] w-[13px] -translate-x-1/2 cursor-ew-resize" style={{ left: t * pps }} title="Playhead — drag to scrub">
      <svg width={13} height={16} className="absolute bottom-0 left-0 block drop-shadow-[0_0_4px_rgba(255,85,0,0.6)]">
        <path d="M1 0H12V9L6.5 15L1 9Z" fill="#FF5500" />
      </svg>
      <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-orange/70" />
    </div>
  );
}

export function PlayheadTC({ t, fps, total }: { t: number; fps: number; total: number }) {
  return (
    <div className="flex h-full flex-col justify-center px-2 font-mono leading-none">
      <span className="text-[11px] font-semibold tabular-nums text-orange">{fmtTC(t, fps)}</span>
      <span className="mt-[2px] text-[8.5px] tabular-nums text-muted">/ {fmtTC(total, fps)}</span>
    </div>
  );
}
