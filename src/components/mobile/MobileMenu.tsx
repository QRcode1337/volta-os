'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, RefreshCw, Search, X } from 'lucide-react';
import { MicroAppIcon } from '@/components/dashboard/widgets/MicroAppIcon';
import { AwaitingBadge } from '@/components/dashboard/widgets/AwaitingBadge';
import { useSharedJson } from '@/components/dashboard/widgets/shared-json';
import { openSearchPalette } from '@/components/search/palette-events';
import { MICRO_APPS } from '@/lib/mock-data';
import { formatInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { ObsidianVault } from '@/types/ltm';
import type { MicroAppItem } from '@/types/os';
import { MOBILE_MEDIA_QUERY, MOBILE_MENU_OPEN_EVENT, MOBILE_MENU_STATE_EVENT } from './constants';

/** Open the phone "More" sheet from anywhere (the mobile home header uses this). No-op at >= md. */
export function openMobileMenu(): void {
  window.dispatchEvent(new CustomEvent(MOBILE_MENU_OPEN_EVENT));
}

// Same ordering as the desktop launcher (MicroAppsWidget): real-data apps first, sample-content tool apps after.
const APPS: MicroAppItem[] = [...MICRO_APPS.filter((a) => !a.sample), ...MICRO_APPS.filter((a) => a.sample)];

/** Real note totals for the Second Brain row (MICRO_APPS' static subtitle is a placeholder); shares /api/vaults with the desktop widget. */
function useBrainSubtitle(): string | null {
  const { data, error } = useSharedJson<{ vaults: ObsidianVault[] }>('/api/vaults', null);
  const vaults = data?.vaults;
  if (!Array.isArray(vaults)) return error ? 'Wikilink graph across Obsidian vaults' : null;
  if (vaults.length === 0) return 'Wikilink graph · no Obsidian vaults found';
  const notes = vaults.reduce((s, v) => s + (v.notes || 0), 0);
  return `${formatInt(notes)} notes · ${vaults.length} Obsidian vault${vaults.length === 1 ? '' : 's'}`;
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Phone bottom sheet (< md): every micro app plus the header controls that don't fit on a phone
 * (Awaiting you, refresh, search). Opens on the 'volta:open-mobile-menu' window event; closes on backdrop,
 * Escape, close button, link tap and route change. Mounted once in the root layout.
 */
export function MobileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const restoreRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  // Open on the event, but only on phones: at >= md the sheet would be mounted but hidden (and would lock scroll).
  useEffect(() => {
    const onOpen = () => {
      if (!window.matchMedia(MOBILE_MEDIA_QUERY).matches) return;
      restoreRef.current = document.activeElement as HTMLElement | null;
      setOpen(true);
    };
    window.addEventListener(MOBILE_MENU_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(MOBILE_MENU_OPEN_EVENT, onOpen);
  }, []);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close if the viewport grows past the phone breakpoint (rotate / resize) so scroll is never locked behind a hidden sheet.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
    const onChange = () => {
      if (!mq.matches) setOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [open]);

  // Broadcast state (the tab bar highlights More while open) and restore focus on close.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open === wasOpen.current) return;
    wasOpen.current = open;
    window.dispatchEvent(new CustomEvent(MOBILE_MENU_STATE_EVENT, { detail: { open } }));
    if (!open) {
      const el = restoreRef.current;
      restoreRef.current = null;
      if (el && document.contains(el)) el.focus?.({ preventScroll: true });
    }
  }, [open]);

  return open ? <Sheet onClose={close} pathname={pathname ?? '/'} /> : null;
}

function Sheet({ onClose, pathname }: { onClose: () => void; pathname: string }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const brainSubtitle = useBrainSubtitle();

  // Slide up on the frame after mount; lock body scroll; focus the sheet.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheetRef.current?.focus({ preventScroll: true });
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Escape closes; Tab is kept inside the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = sheetRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onSearch = () => {
    onClose();
    openSearchPalette();
  };
  const onRefresh = () => {
    // The dashboard's own refresh handler is private to CenterOrbitalCore, so on a phone refresh = reload the page data.
    setRefreshing(true);
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[90] md:hidden" data-mobile-menu>
      <div
        aria-hidden
        onClick={onClose}
        className={cn('absolute inset-0 bg-black/70 backdrop-blur-[2px] transition-opacity duration-200 motion-reduce:transition-none', entered ? 'opacity-100' : 'opacity-0')}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="VOLTA OS menu"
        tabIndex={-1}
        className={cn(
          'absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[18px] border-t border-highlight bg-panel shadow-[0_-16px_48px_rgba(0,0,0,0.65)] outline-none transition-transform duration-250 ease-out motion-reduce:transition-none',
          entered ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-highlight" />
        <header className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-2">
          <h2 className="hud-label">VOLTA OS · Menu</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors active:bg-panel-hover active:text-paper"
          >
            <X size={18} />
          </button>
        </header>

        <div
          className="hud-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3"
          style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
        >
          {/* Header controls that don't fit the phone layout */}
          <div className="flex flex-wrap items-center gap-2 px-1 pb-3">
            {/* Capture-phase close so tapping the badge while already on /apps/tasks still dismisses the sheet. */}
            <div onClickCapture={onClose}>
              <AwaitingBadge className="h-9" />
            </div>
            <button
              type="button"
              onClick={onSearch}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-subtle px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-secondary transition-colors active:border-highlight active:text-paper"
            >
              <Search size={12} /> Search
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-subtle px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-secondary transition-colors active:border-highlight active:text-paper disabled:opacity-60"
            >
              <RefreshCw size={12} className={cn(refreshing && 'robo-spin')} /> Refresh
            </button>
          </div>

          <div className="flex items-center gap-2 border-t border-subtle px-1 pb-1.5 pt-3">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary">Micro apps</span>
            <span className="font-mono text-[10px] text-muted">{APPS.length}</span>
          </div>
          <ul className="flex flex-col">
            {APPS.map((app) => {
              const current = pathname === app.route || pathname.startsWith(`${app.route}/`);
              const subtitle = app.id === 'brain' ? (brainSubtitle ?? 'Wikilink graph across Obsidian vaults') : app.subtitle;
              return (
                <li key={app.id}>
                  <Link
                    href={app.route}
                    onClick={onClose}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'group flex min-h-[52px] items-center gap-3 rounded-lg border px-2 py-2 transition-colors active:bg-panel-hover',
                      current ? 'border-orange/40 bg-orange/[0.06]' : 'border-transparent',
                    )}
                  >
                    <MicroAppIcon type={app.iconType} color={app.accentColor} size={34} className={cn(app.sample && 'opacity-70 saturate-50')} />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className={cn('truncate text-[14px] font-semibold leading-tight', app.sample ? 'text-paper/80' : 'text-paper')}>{app.name}</span>
                        {app.sample && (
                          <span className="shrink-0 rounded-[4px] border border-subtle bg-obsidian px-1 font-mono text-[8.5px] font-semibold uppercase leading-[14px] tracking-[0.08em] text-muted">
                            Sample
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11.5px] leading-tight text-muted">{subtitle}</span>
                    </span>
                    <ArrowUpRight size={14} className={cn('shrink-0', current ? 'text-orange' : 'text-muted')} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default MobileMenu;
