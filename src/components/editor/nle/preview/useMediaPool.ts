'use client';

// VOLTA Editor — Edit mode preview: registry + sync of the pooled <video> / <audio> elements (keyed by clip id).
// Paused: every element is parked exactly on its target frame (latest-wins seeking, so scrubbing never queues seeks).
// Playing: active elements play at clip.rate and are only corrected when they drift; upcoming ones are primed paused
// on their in-point so cuts are seamless.
import { useCallback, useMemo, useRef } from 'react';
import type { NleClip } from '@/types/nle';
import type { AudioMix } from './useAudioMix';

export interface MediaEntry {
  id: string;
  clip: NleClip;
  /** Source seconds this element should show / play from now. */
  target: number;
  /** Part of the current picture / mix (plays while the sequence plays); false = primed for later. */
  active: boolean;
  /** 0..2 audible gain right now (0 = muted). */
  gain: number;
}

/** Hard re-seek threshold while playing (source seconds). */
const DRIFT_HARD = 0.15;
/** Soft drift band corrected by a slight playbackRate nudge. */
const DRIFT_SOFT = 0.035;
/** Priming tolerance for elements waiting for their clip to start. */
const PRIME_TOL = 0.04;
/** Paused tolerance: re-seek whenever the target moved by more than this. */
const PARK_TOL = 0.001;
/** A stall longer than this stops holding the clock (decoder stuck / file truncated). */
const STALL_GIVE_UP_MS = 5000;

export interface MediaPool {
  ref: (id: string) => (el: HTMLMediaElement | null) => void;
  sync: (entries: MediaEntry[], playing: boolean) => void;
  onSeeked: (el: HTMLMediaElement) => void;
  markError: (id: string) => void;
  clearError: (id: string) => void;
  /** An active element can't play yet (loading / seeking / waiting): the clock should hold. */
  isStalled: () => boolean;
}

function atEnd(el: HTMLMediaElement, target: number): boolean {
  return Number.isFinite(el.duration) && el.duration > 0 && target >= el.duration - 0.05;
}

export function useMediaPool(mix: AudioMix): MediaPool {
  const els = useRef(new Map<string, HTMLMediaElement>());
  const refCbs = useRef(new Map<string, (el: HTMLMediaElement | null) => void>());
  const pending = useRef(new WeakMap<HTMLMediaElement, number>());
  const errored = useRef(new Set<string>());
  const entriesRef = useRef<MediaEntry[]>([]);
  const playingRef = useRef(false);
  const stallSince = useRef(new Map<string, number>());

  const seekTo = useCallback((el: HTMLMediaElement, t: number) => {
    if (el.seeking) {
      pending.current.set(el, t);
      return;
    }
    pending.current.delete(el);
    try {
      el.currentTime = t;
    } catch {
      /* not seekable yet */
    }
  }, []);

  const ref = useCallback(
    (id: string) => {
      let cb = refCbs.current.get(id);
      if (!cb) {
        cb = (el: HTMLMediaElement | null) => {
          const old = els.current.get(id);
          if (el) {
            els.current.set(id, el);
          } else {
            if (old) {
              try {
                old.pause();
              } catch {
                /* noop */
              }
              mix.release(old);
            }
            els.current.delete(id);
            stallSince.current.delete(id);
          }
        };
        refCbs.current.set(id, cb);
      }
      return cb;
    },
    [mix],
  );

  const onSeeked = useCallback((el: HTMLMediaElement) => {
    const p = pending.current.get(el);
    if (p == null) return;
    pending.current.delete(el);
    if (Math.abs(el.currentTime - p) > PARK_TOL) {
      try {
        el.currentTime = p;
      } catch {
        /* noop */
      }
    }
  }, []);

  const play = useCallback((el: HTMLMediaElement) => {
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch((err: unknown) => {
        // autoplay policy: keep the picture moving silently rather than freezing
        if (err instanceof DOMException && err.name === 'NotAllowedError' && !el.muted) {
          el.muted = true;
          el.play().catch(() => undefined);
        }
      });
    }
  }, []);

  const sync = useCallback(
    (entries: MediaEntry[], playing: boolean) => {
      entriesRef.current = entries;
      playingRef.current = playing;
      for (const e of entries) {
        const el = els.current.get(e.id);
        if (!el) continue;
        mix.apply(el, playing && e.active ? e.gain : 0);
        if (errored.current.has(e.id)) continue;
        const rate = e.clip.rate || 1;
        const end = atEnd(el, e.target);
        if (playing && e.active && !end) {
          const drift = el.currentTime - e.target;
          if (Math.abs(drift) > DRIFT_HARD * Math.max(1, rate) || el.ended) {
            seekTo(el, e.target);
            if (el.playbackRate !== rate) el.playbackRate = rate;
          } else {
            // gentle convergence instead of visible jumps
            const want = Math.abs(drift) > DRIFT_SOFT ? rate * (drift > 0 ? 0.96 : 1.04) : rate;
            if (Math.abs(el.playbackRate - want) > 1e-3) el.playbackRate = want;
          }
          if (el.paused) play(el);
        } else {
          if (!el.paused) el.pause();
          if (el.playbackRate !== rate) el.playbackRate = rate;
          const tol = e.active ? PARK_TOL : PRIME_TOL;
          if (Math.abs(el.currentTime - e.target) > tol && !(end && el.ended)) seekTo(el, e.target);
        }
      }
      // anything registered but not wanted (should not happen; defensive)
      if (els.current.size > entries.length) {
        const ids = new Set(entries.map((e) => e.id));
        for (const [id, el] of els.current) if (!ids.has(id) && !el.paused) el.pause();
      }
    },
    [mix, play, seekTo],
  );

  const isStalled = useCallback(() => {
    if (!playingRef.current) return false;
    const now = performance.now();
    let stalled = false;
    for (const e of entriesRef.current) {
      if (!e.active || errored.current.has(e.id)) continue;
      const el = els.current.get(e.id);
      if (!el || el.error || atEnd(el, e.target)) {
        stallSince.current.delete(e.id);
        continue;
      }
      if (el.readyState < 3 || el.seeking) {
        const since = stallSince.current.get(e.id) ?? now;
        stallSince.current.set(e.id, since);
        if (now - since < STALL_GIVE_UP_MS) stalled = true;
      } else stallSince.current.delete(e.id);
    }
    if (stalled) {
      // hold everything with the clock so nothing drifts ahead; the next sync() after the stall resumes them
      for (const e of entriesRef.current) {
        const el = els.current.get(e.id);
        if (el && !el.paused && el.readyState >= 3 && !el.seeking) el.pause();
      }
    }
    return stalled;
  }, []);

  const markError = useCallback((id: string) => {
    errored.current.add(id);
  }, []);
  const clearError = useCallback((id: string) => {
    errored.current.delete(id);
  }, []);

  return useMemo(() => ({ ref, sync, onSeeked, markError, clearError, isStalled }), [ref, sync, onSeeked, markError, clearError, isStalled]);
}
