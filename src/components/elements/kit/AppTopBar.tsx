'use client';
// Shared micro-app chrome (contract §7) used by VOLTA Scripts and Elements.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PixelMascotLogo } from '@/components/robo-ui';

export interface AppTopBarProps {
  /** Orange Doto accent word after "VOLTA". */
  accent: string;
  subtitle?: string;
  /** Rendered right after the title block (selectors etc.). */
  center?: ReactNode;
  /** Right-aligned actions. */
  right?: ReactNode;
}

/*
 * Phone (< md): back link collapses to a 36px round icon button, the title truncates on one line,
 * the subtitle is hidden and the center/right slots share one horizontally scrollable strip so they
 * can never push the header past the viewport (honors the iPhone notch via safe-area padding).
 * md+: `md:contents` dissolves the strip wrapper, so the layout is identical to the desktop header.
 */
export function AppTopBar({ accent, subtitle, center, right }: AppTopBarProps) {
  return (
    <header className="relative z-20 flex h-[calc(3.5rem+env(safe-area-inset-top,0px))] shrink-0 items-center gap-2 border-b border-subtle bg-panel/80 px-3 pt-[env(safe-area-inset-top,0px)] backdrop-blur md:h-14 md:gap-4 md:px-4 md:pt-0">
      <Link
        href="/"
        aria-label="Back to VOLTA OS"
        title="Back to VOLTA OS"
        className="group inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-subtle bg-panel-elevated font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-highlight hover:text-paper md:h-8 md:w-auto md:justify-start md:px-3"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
        <span className="max-md:sr-only">Back to VOLTA OS</span>
      </Link>
      <div className="h-6 w-px bg-subtle max-md:hidden" />
      <div className="flex items-center gap-2.5 max-md:min-w-0 max-md:max-w-[50%] max-md:shrink-0 max-md:gap-2">
        <PixelMascotLogo size={24} className="max-[400px]:hidden" />
        <div className="flex flex-col leading-none max-md:min-w-0">
          <span className="flex items-baseline gap-2 max-md:min-w-0 max-md:gap-1.5">
            <span className="text-[17px] font-bold tracking-tight text-paper max-md:shrink-0">VOLTA</span>
            <span className="font-doto text-[18px] font-bold text-orange max-md:truncate">{accent}</span>
          </span>
          {subtitle && <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted max-md:hidden">{subtitle}</span>}
        </div>
      </div>
      {(center || right) && (
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto py-1 max-md:ml-auto max-md:shrink [scrollbar-width:none] md:contents [&::-webkit-scrollbar]:hidden">
          {center && <div className="flex min-w-0 items-center gap-2 pl-2 max-md:shrink-0 max-md:pl-0">{center}</div>}
          {right && <div className="ml-auto flex items-center gap-2 max-md:shrink-0">{right}</div>}
        </div>
      )}
    </header>
  );
}
