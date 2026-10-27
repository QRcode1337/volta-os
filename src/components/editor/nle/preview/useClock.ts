'use client';

// VOLTA Editor — Edit mode preview: the master clock. While playing, a rAF loop dispatches TICK with real elapsed
// seconds (clamped to 0.1 s). It holds (does not advance) while an active element is stalled, and reports buffering.
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { NleAction } from '../state';

export interface ClockOpts {
  playing: boolean;
  dispatch: React.Dispatch<NleAction>;
  isStalled: () => boolean;
  /** Called with true once a stall lasts > 150 ms, and with false when it clears / the clock stops. */
  onBuffering: (b: boolean) => void;
  /** Loop: wrap to 0 instead of stopping at the end. */
  loop: boolean;
  playhead: number;
  duration: number;
}

export function useClock(o: ClockOpts): void {
  const live = useRef(o);
  useLayoutEffect(() => {
    live.current = o;
  });

  useEffect(() => {
    if (!o.playing) return;
    let raf = 0;
    let last = performance.now();
    let stallStart: number | null = null;
    let buffering = false;
    const setBuf = (b: boolean) => {
      if (b !== buffering) {
        buffering = b;
        live.current.onBuffering(b);
      }
    };
    const frame = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const cur = live.current;
      if (cur.isStalled()) {
        if (stallStart == null) stallStart = now;
        if (now - stallStart > 150) setBuf(true);
      } else {
        stallStart = null;
        setBuf(false);
        if (dt > 0) {
          if (cur.loop && cur.duration > 0 && cur.playhead + dt >= cur.duration) cur.dispatch({ type: 'SEEK', t: 0 });
          else cur.dispatch({ type: 'TICK', dt });
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (buffering) live.current.onBuffering(false);
    };
  }, [o.playing]);
}
