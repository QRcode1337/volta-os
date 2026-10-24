'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { OS_EVENTS } from '@/lib/events';

/**
 * Live clock. Returns `null` on the server and on the first client render (hydration-safe),
 * then ticks on each wall-clock second boundary.
 */
export function useNow(intervalMs = 1000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      timer = setTimeout(tick, intervalMs - (d.getTime() % intervalMs) + 5);
    };
    tick();
    return () => clearTimeout(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Close a popover/modal on: pointerdown outside every given ref, the Esc key,
 * and the global `OS_EVENTS.escape` window event dispatched by the home shell.
 */
export function useDismiss(open: boolean, onClose: () => void, refs: RefObject<HTMLElement | null>[]): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const refsRef = useRef(refs);
  refsRef.current = refs;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const inside = refsRef.current.some((r) => r.current && r.current.contains(target));
      if (!inside) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    const onOsEscape = () => closeRef.current();
    // Defer so the click that opened us doesn't immediately close us.
    const id = setTimeout(() => document.addEventListener('pointerdown', onPointer, true), 0);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OS_EVENTS.escape, onOsEscape);
    return () => {
      clearTimeout(id);
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OS_EVENTS.escape, onOsEscape);
    };
  }, [open]);
}

/** Small transient status message (auto-clears). */
export function useFlash(durationMs = 2600): [string | null, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const flash = (m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), durationMs);
  };
  return [msg, flash];
}

/** True once mounted on the client (for portals). */
export function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
