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

export function AppTopBar({ accent, subtitle, center, right }: AppTopBarProps) {
  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-4 border-b border-subtle bg-panel/80 px-4 backdrop-blur">
      <Link
        href="/"
        className="group inline-flex h-8 items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-highlight hover:text-paper"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
        Back to VOLTA OS
      </Link>
      <div className="h-6 w-px bg-subtle" />
      <div className="flex items-center gap-2.5">
        <PixelMascotLogo size={24} />
        <div className="flex flex-col leading-none">
          <span className="flex items-baseline gap-2">
            <span className="text-[17px] font-bold tracking-tight text-paper">VOLTA</span>
            <span className="font-doto text-[18px] font-bold text-orange">{accent}</span>
          </span>
          {subtitle && <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">{subtitle}</span>}
        </div>
      </div>
      {center && <div className="flex min-w-0 items-center gap-2 pl-2">{center}</div>}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </header>
  );
}
