'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Brain, Home, MoreHorizontal, Search, Server, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { MOBILE_MENU_STATE_EVENT, MOBILE_TABBAR_HEIGHT_PX } from './constants';
import { openMobileMenu } from './MobileMenu';

// Re-exported for convenience in client code. Server code (layout.tsx) must import it from './constants'.
export { MOBILE_TABBAR_HEIGHT_PX };

interface Tab {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** True when `pathname` belongs to this tab. */
  match: (pathname: string) => boolean;
}

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

const TABS: Tab[] = [
  { id: 'home', label: 'Home', href: '/', icon: Home, match: (p) => p === '/' },
  { id: 'search', label: 'Search', href: '/apps/search', icon: Search, match: (p) => under(p, '/apps/search') },
  {
    id: 'memory',
    label: 'Memory',
    href: '/apps/ltm',
    icon: Brain,
    match: (p) => under(p, '/apps/ltm') || under(p, '/apps/honcho') || under(p, '/second-brain'),
  },
  {
    id: 'systems',
    label: 'Systems',
    href: '/apps/systems',
    icon: Server,
    match: (p) => under(p, '/apps/systems') || under(p, '/apps/sessions'),
  },
];

const ITEM =
  'relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-[3px] font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:bg-panel-hover';

/**
 * Fixed bottom tab bar, phones only (< md). Home / Search / Memory / Systems are links; More opens MobileMenu.
 * Reserve MOBILE_TABBAR_HEIGHT_PX + env(safe-area-inset-bottom) at the bottom of page content below md.
 */
export function MobileTabBar() {
  const pathname = usePathname() ?? '/';
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onState = (e: Event) => setMenuOpen(!!(e as CustomEvent<{ open?: boolean }>).detail?.open);
    window.addEventListener(MOBILE_MENU_STATE_EVENT, onState);
    return () => window.removeEventListener(MOBILE_MENU_STATE_EVENT, onState);
  }, []);

  const activeTab = TABS.find((t) => t.match(pathname))?.id ?? null;
  // More lights up while its sheet is open, and on any page that none of the four tabs owns (e.g. /apps/tasks).
  const moreActive = menuOpen || activeTab === null;

  return (
    <nav
      aria-label="Primary"
      data-mobile-tabbar
      className="fixed inset-x-0 bottom-0 z-50 flex border-t border-subtle bg-obsidian/95 backdrop-blur-md md:hidden"
      style={{ height: `calc(${MOBILE_TABBAR_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))`, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {TABS.map((t) => {
        const active = !menuOpen && activeTab === t.id;
        const Icon = t.icon;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cn(ITEM, active ? 'text-orange' : 'text-muted active:text-paper')}
          >
            {active && <span aria-hidden className="absolute inset-x-4 top-0 h-[2px] rounded-b-full bg-orange shadow-[0_0_10px_rgba(255,85,0,0.6)]" />}
            <Icon size={20} strokeWidth={active ? 2.3 : 1.8} aria-hidden />
            <span>{t.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => openMobileMenu()}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        className={cn(ITEM, moreActive ? 'text-orange' : 'text-muted active:text-paper')}
      >
        {moreActive && <span aria-hidden className="absolute inset-x-4 top-0 h-[2px] rounded-b-full bg-orange shadow-[0_0_10px_rgba(255,85,0,0.6)]" />}
        <MoreHorizontal size={20} strokeWidth={moreActive ? 2.3 : 1.8} aria-hidden />
        <span>More</span>
      </button>
    </nav>
  );
}

export default MobileTabBar;
