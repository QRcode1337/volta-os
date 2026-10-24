'use client';
import { useEffect, useRef } from 'react';

/**
 * Runs `fn` once whenever `key` changes, then every `ms` while the tab is visible.
 *
 * - Hidden tab: the pending tick lapses (no requests in the background).
 * - Shown again: runs at once if a full interval has passed since the last run, otherwise waits
 *   out the remainder, so two runs are never closer than `ms` apart.
 * - `key === null` disables it (e.g. while offline). A new key restarts with an immediate run.
 * - `fn` may return a cleanup (e.g. abort its request); it is called before the next run and on
 *   teardown. The latest `fn` is always used without restarting the schedule.
 */
export function useVisiblePoll(fn: () => void | (() => void), ms: number, key: string | null) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (key == null) return;
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cleanup: void | (() => void);

    const arm = (delay: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, Math.max(0, delay));
    };
    const run = () => {
      cleanup?.();
      last = Date.now();
      cleanup = fnRef.current();
      arm(ms);
    };
    function tick() {
      timer = null;
      if (!document.hidden) run();
    }
    const onVisibility = () => {
      if (document.hidden) return;
      const since = Date.now() - last;
      if (since >= ms) run();
      else if (!timer) arm(ms - since);
    };

    run();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      cleanup?.();
    };
  }, [key, ms]);
}
