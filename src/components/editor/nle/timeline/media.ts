'use client';
// VOLTA Editor — Edit mode timeline: filmstrip sprites and audio peaks from the server, with module-level caches.
// Both endpoints may be missing / failing (they are optional decoration): failures are cached and retried after a while.
import { useEffect, useReducer } from 'react';
import type { NlePeaks } from '@/types/nle';

export interface FilmstripSprite {
  url: string;
  count: number;
  frameW: number;
  frameH: number;
  duration: number;
}

type Entry<T> = { status: 'loading' } | { status: 'ok'; v: T } | { status: 'err'; at: number };
const RETRY_MS = 20_000;

function makeCache<T>(fetcher: (key: string) => Promise<T>) {
  const map = new Map<string, Entry<T>>();
  const subs = new Map<string, Set<() => void>>();
  const notify = (key: string) => subs.get(key)?.forEach((fn) => fn());
  return {
    load(key: string) {
      const e = map.get(key);
      if (e && (e.status !== 'err' || Date.now() - e.at < RETRY_MS)) return;
      map.set(key, { status: 'loading' });
      fetcher(key).then(
        (v) => {
          map.set(key, { status: 'ok', v });
          notify(key);
        },
        () => {
          map.set(key, { status: 'err', at: Date.now() });
          notify(key);
        },
      );
    },
    get(key: string): T | null {
      const e = map.get(key);
      return e?.status === 'ok' ? e.v : null;
    },
    subscribe(key: string, fn: () => void) {
      let set = subs.get(key);
      if (!set) subs.set(key, (set = new Set()));
      set.add(fn);
      return () => {
        set?.delete(fn);
      };
    },
  };
}

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

const thumbs = makeCache<FilmstripSprite>(async (key) => {
  const [id, count] = key.split('|');
  const j = (await getJson(`/api/editor/nle/thumbs?id=${encodeURIComponent(id)}&count=${count}`)) as Partial<FilmstripSprite>;
  if (typeof j?.url !== 'string' || !(Number(j.count) > 0) || !(Number(j.frameW) > 0) || !(Number(j.frameH) > 0) || !(Number(j.duration) > 0)) throw new Error('bad thumbs');
  return { url: j.url, count: Number(j.count), frameW: Number(j.frameW), frameH: Number(j.frameH), duration: Number(j.duration) };
});

const peaks = makeCache<NlePeaks>(async (id) => {
  const j = (await getJson(`/api/editor/nle/peaks?id=${encodeURIComponent(id)}`)) as Partial<NlePeaks>;
  if (!Array.isArray(j?.peaks) || !(Number(j.rate) > 0)) throw new Error('bad peaks');
  return { rate: Number(j.rate), peaks: j.peaks.map((p) => Number(p) || 0), duration: Number(j.duration) || j.peaks.length / Number(j.rate) };
});

function useCached<T>(cache: ReturnType<typeof makeCache<T>>, key: string | null): T | null {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!key) return;
    const un = cache.subscribe(key, force);
    cache.load(key);
    return un;
  }, [cache, key]);
  return key ? cache.get(key) : null;
}

/** Frames requested ∝ source length (one per ~1.5 s), 2..40. */
export function filmstripCount(sourceDuration: number | null): number {
  return Math.max(2, Math.min(40, Math.ceil((sourceDuration ?? 10) / 1.5)));
}

export function useFilmstrip(assetId: string | null, sourceDuration: number | null): FilmstripSprite | null {
  return useCached(thumbs, assetId ? `${assetId}|${filmstripCount(sourceDuration)}` : null);
}

export function usePeaks(assetId: string | null): NlePeaks | null {
  return useCached(peaks, assetId);
}
