'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { MOBILE_MEDIA_QUERY } from './constants';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** true below md, false at md+, null during SSR/hydration (viewport unknown). */
function useIsPhone(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_MEDIA_QUERY).matches,
    () => null,
  );
}

/**
 * Home switch. SSR and the hydration pass render both trees and let CSS (`md:`) pick, so there is no flash;
 * right after hydration only the matching tree stays mounted, so phones don't run the desktop orbital core
 * (3D sphere, ring animation, every widget poller) hidden behind `display: none`.
 * The two slots keep fixed positions, so the surviving tree is not remounted.
 */
export function ResponsiveHome({ phone, desktop }: { phone: ReactNode; desktop: ReactNode }) {
  const isPhone = useIsPhone();
  return (
    <>
      {isPhone !== false && (
        <div className="hud-scroll h-screen w-screen overflow-y-auto overflow-x-hidden bg-obsidian md:hidden">{phone}</div>
      )}
      {isPhone !== true && <div className="hidden md:contents">{desktop}</div>}
    </>
  );
}
