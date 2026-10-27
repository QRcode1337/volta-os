'use client';
// VOLTA Editor — Edit mode: lazy poster / sprite thumbnails from /api/editor/nle/thumbs, cached per asset id + frame
// count, with a small concurrency cap so a big bin does not fan out dozens of ffmpeg jobs at once.

import { useEffect, useRef, useState, type RefObject } from 'react';

export interface ThumbInfo {
  url: string;
  count: number;
  frameW: number;
  frameH: number;
  duration: number;
}

const cache = new Map<string, ThumbInfo | null>();
const inflight = new Map<string, Promise<ThumbInfo | null>>();
const MAX_CONCURRENT = 4;
let running = 0;
const queue: (() => void)[] = [];

function schedule<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      running++;
      fn()
        .then(resolve, reject)
        .finally(() => {
          running--;
          queue.shift()?.();
        });
    };
    if (running < MAX_CONCURRENT) run();
    else queue.push(run);
  });
}

export function loadThumb(id: string, count = 1): Promise<ThumbInfo | null> {
  const key = `${id}#${count}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = schedule(async () => {
    try {
      const r = await fetch(`/api/editor/nle/thumbs?id=${encodeURIComponent(id)}&count=${count}`);
      if (!r.ok) return null;
      const j = (await r.json()) as Partial<ThumbInfo>;
      if (!j.url) return null;
      return { url: j.url, count: j.count ?? count, frameW: j.frameW ?? 0, frameH: j.frameH ?? 0, duration: j.duration ?? 0 };
    } catch {
      return null;
    }
  }).then((info) => {
    cache.set(key, info);
    inflight.delete(key);
    return info;
  });
  inflight.set(key, p);
  return p;
}

/** undefined = not loaded yet, null = unavailable. Fetches only while `enabled`. */
export function useThumb(id: string | null, count: number, enabled: boolean): ThumbInfo | null | undefined {
  const key = id ? `${id}#${count}` : '';
  const [info, setInfo] = useState<ThumbInfo | null | undefined>(() => (key && cache.has(key) ? cache.get(key) : undefined));
  useEffect(() => {
    if (!id || !enabled) return;
    if (cache.has(key)) {
      setInfo(cache.get(key));
      return;
    }
    let alive = true;
    loadThumb(id, count).then((i) => alive && setInfo(i));
    return () => {
      alive = false;
    };
  }, [id, count, enabled, key]);
  return info;
}

/** True once the element has come within `margin` of the viewport (sticky). */
export function useInView(ref: RefObject<Element | null>, margin = '200px'): boolean {
  const [seen, setSeen] = useState(false);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || done.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          done.current = true;
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return seen;
}
