'use client';

// VOLTA Editor — Edit mode preview: Web Audio gain per media element so clip volume can go up to 2× (element.volume
// caps at 1). The AudioContext is created lazily on the first play gesture; until then element.volume is used.
import { useCallback, useEffect, useMemo, useRef } from 'react';

type Ctx = AudioContext;

export interface AudioMix {
  /** Create / resume the AudioContext. Call from a user gesture (play button, pointerdown) or right after one. */
  ensure: () => void;
  /** Apply a 0..2 gain to an element (routes it through a GainNode once a context exists). */
  apply: (el: HTMLMediaElement, gain: number) => void;
  /** Forget an element that is being unmounted. */
  release: (el: HTMLMediaElement) => void;
}

export function useAudioMix(): AudioMix {
  const ctxRef = useRef<Ctx | null>(null);
  const nodes = useRef(new WeakMap<HTMLMediaElement, { src: MediaElementAudioSourceNode; gain: GainNode; connected: boolean }>());
  const failed = useRef(new WeakSet<HTMLMediaElement>());

  const ensure = useCallback(() => {
    if (typeof window === 'undefined') return;
    let ctx = ctxRef.current;
    if (!ctx) {
      const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
        ctxRef.current = ctx;
      } catch {
        return;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  }, []);

  const apply = useCallback((el: HTMLMediaElement, gain: number) => {
    const g = Math.max(0, Math.min(2, gain));
    const ctx = ctxRef.current;
    let n = nodes.current.get(el);
    if (!n && ctx && ctx.state !== 'closed' && !failed.current.has(el)) {
      try {
        const src = ctx.createMediaElementSource(el);
        const gainNode = ctx.createGain();
        gainNode.gain.value = g;
        src.connect(gainNode).connect(ctx.destination);
        n = { src, gain: gainNode, connected: true };
        nodes.current.set(el, n);
      } catch {
        // already routed by another context (HMR) or not allowed: fall back to element.volume
        failed.current.add(el);
      }
    }
    if (n && ctx) {
      if (!n.connected) {
        n.gain.connect(ctx.destination);
        n.connected = true;
      }
      if (el.volume !== 1) el.volume = 1;
      if (Math.abs(n.gain.gain.value - g) > 1e-3) n.gain.gain.setTargetAtTime(g, ctx.currentTime, 0.012);
    } else {
      const v = Math.min(1, g);
      if (Math.abs(el.volume - v) > 1e-3) el.volume = v;
    }
    const mute = g <= 0;
    if (el.muted !== mute) el.muted = mute;
  }, []);

  // An element can be routed into a context only once, so a released element keeps its source node (StrictMode re-attaches
  // refs); only its path to the speakers is cut, and apply() restores it.
  const release = useCallback((el: HTMLMediaElement) => {
    const n = nodes.current.get(el);
    if (!n || !n.connected) return;
    try {
      n.gain.disconnect();
    } catch {
      /* already disconnected */
    }
    n.connected = false;
  }, []);

  useEffect(
    () => () => {
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== 'closed') ctx.close().catch(() => undefined);
    },
    [],
  );

  return useMemo(() => ({ ensure, apply, release }), [ensure, apply, release]);
}
