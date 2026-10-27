'use client';
import { useSyncExternalStore } from 'react';

// VOLTA runs on the Mac at 127.0.0.1 and is also opened from the phone over the tailnet (…ts.net). Anything that
// acts on the Mac (Terminal, `open`, loopback URLs) only makes sense when the page itself is loaded on the Mac.

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** The page was loaded from somewhere other than this Mac's loopback (the tailnet, from the phone). */
export function isRemoteClient(): boolean {
  return typeof window !== 'undefined' && !LOOPBACK.has(window.location.hostname);
}

const noop = () => () => {};

/** `isRemoteClient()` as a hook; false during SSR and the first client render, so markup hydrates cleanly. */
export function useRemoteClient(): boolean {
  return useSyncExternalStore(noop, isRemoteClient, () => false);
}

/** An http(s) URL that points at the Mac's loopback, so it only opens on the Mac itself. */
export function isLoopbackUrl(href: string): boolean {
  try {
    const u = new URL(href);
    return (u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK.has(u.hostname);
  } catch {
    return false;
  }
}
