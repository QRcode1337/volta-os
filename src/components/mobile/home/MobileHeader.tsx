'use client';

import { Menu } from 'lucide-react';
import { PixelMascotLogo } from '@/components/robo-ui';
import { OS_OWNER } from '@/lib/mock-data';

/** Event the MobileMenu (another agent) listens for. */
export const OPEN_MOBILE_MENU_EVENT = 'volta:open-mobile-menu';

/** Compact sticky header: mascot + VOLTA, owner on one truncated line, round menu button. Clears the notch. */
export function MobileHeader() {
  return (
    <header
      className="sticky top-0 z-30 border-b border-subtle bg-obsidian/90 backdrop-blur-md"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex h-14 items-center gap-3 px-4">
        <PixelMascotLogo size={28} className="shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <h1 className="flex items-baseline gap-1.5 leading-none">
            <span className="text-[19px] font-bold tracking-[0.01em] text-paper">VOLTA</span>
            <span className="font-doto text-[15px] font-bold text-orange">OS</span>
          </h1>
          <span className="mt-0.5 block truncate font-mono text-[11px] leading-[14px] tracking-[0.02em] text-muted">
            {OS_OWNER.name} | {OS_OWNER.org}
          </span>
        </div>
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_MOBILE_MENU_EVENT))}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-subtle bg-panel-elevated text-paper outline-none transition-colors active:bg-panel-hover focus-visible:ring-2 focus-visible:ring-orange/50"
        >
          <Menu size={18} />
        </button>
      </div>
    </header>
  );
}
