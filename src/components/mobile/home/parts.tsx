'use client';
// Presentational primitives shared by the phone home cards: card shell, skeleton, offline note.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { RotateCw } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Touch-target floor (px) for every tappable thing on the phone home. */
export const TAP = 'min-h-10';

interface MCardProps {
  title: string;
  icon?: ReactNode;
  /** Right-hand "See all" style link (internal route). */
  href?: string;
  linkLabel?: string;
  /** Small status chip(s) next to the title. */
  headerExtra?: ReactNode;
  /** Highlights the card border (e.g. something is waiting on you). */
  accent?: boolean;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

/** HUD card for the Today feed. Header is 44px with a ≥40px "See all" target; no inner scroll. */
export function MCard({ title, icon, href, linkLabel = 'See all', headerExtra, accent, className, bodyClassName, children }: MCardProps) {
  return (
    <section
      aria-label={title}
      className={cn('hud-card min-w-0 overflow-hidden', accent && 'border-orange/45 bg-orange/[0.04]', className)}
    >
      <header className="flex h-11 items-center gap-2 border-b border-subtle pl-3 pr-1">
        {icon && (
          <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center text-orange [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        )}
        <h2 className="hud-label min-w-0 truncate">{title}</h2>
        {headerExtra && <div className="flex min-w-0 shrink-0 items-center gap-1.5">{headerExtra}</div>}
        {href && (
          <Link
            href={href}
            className="ml-auto inline-flex h-10 shrink-0 items-center rounded-lg px-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-secondary outline-none transition-colors active:bg-panel-hover focus-visible:ring-2 focus-visible:ring-orange/50"
          >
            {linkLabel}
          </Link>
        )}
      </header>
      <div className={cn('p-3', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Skel({ className }: { className?: string }) {
  return <span aria-hidden className={cn('block animate-pulse rounded bg-panel-elevated', className)} />;
}

/** Clear "offline" state for a failed fetch with nothing cached. Retry is a ≥40px target. */
export function OfflineNote({
  label,
  message,
  onRetry,
  busy,
}: {
  label: string;
  message?: string;
  onRetry?: () => void;
  busy?: boolean;
}) {
  return (
    <div role="status" className="flex flex-col items-start gap-1.5">
      <span className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#EF4444]">
        <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-[#EF4444]" />
        {label}
      </span>
      {message && <p className="selectable line-clamp-2 text-[12px] leading-snug text-secondary">{message}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-subtle bg-panel-elevated px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-secondary outline-none transition-colors active:bg-panel-hover focus-visible:ring-2 focus-visible:ring-orange/50"
        >
          <RotateCw size={12} className={cn(busy && 'robo-spin')} /> Retry
        </button>
      )}
    </div>
  );
}

/** Amber one-liner shown when a refresh failed but older data is still on screen. */
export function StaleNote({ message }: { message: string }) {
  return (
    <p className="mt-2 font-mono text-[10px] leading-snug text-amber" title={message}>
      refresh failed · showing last data
    </p>
  );
}

/** Small round count/status chip used in card headers. */
export function Chip({ children, tone = 'muted', title }: { children: ReactNode; tone?: 'muted' | 'orange' | 'red' | 'amber' | 'green'; title?: string }) {
  const cls = {
    muted: 'border-subtle bg-obsidian text-secondary',
    orange: 'border-orange/50 bg-orange/10 text-orange',
    red: 'border-[#EF4444]/40 bg-[#EF4444]/10 text-[#EF4444]',
    amber: 'border-amber/40 bg-amber/10 text-amber',
    green: 'border-green/40 bg-green/10 text-green',
  }[tone];
  return (
    <span title={title} className={cn('whitespace-nowrap rounded-full border px-1.5 font-mono text-[9.5px] font-semibold tabular-nums leading-[16px]', cls)}>
      {children}
    </span>
  );
}
