import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

export interface HudAction {
  label: string; // "EXPAND", "+ ADD", "OPEN CAL"
  onClick?: () => void;
  href?: string;
  primary?: boolean; // orange filled pill
}

export interface HudPanelProps {
  title: string;
  icon?: ReactNode;
  actions?: HudAction[];
  /** Extra header content rendered between title and actions (badges etc.). */
  headerExtra?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

const PILL_BASE =
  'inline-flex h-6 shrink-0 select-none items-center whitespace-nowrap rounded-full border px-2.5 font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.08em] transition-[color,background-color,border-color,filter] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-orange/50 focus-visible:ring-offset-1 focus-visible:ring-offset-obsidian active:translate-y-px';

/** Action pill. Internal hrefs ("/…") use next/link; external/anchor hrefs use a plain <a>. */
export function HudPill({ label, onClick, href, primary }: HudAction) {
  const cls = cn(
    PILL_BASE,
    primary
      ? 'border-orange bg-orange text-obsidian hover:brightness-110'
      : 'border-subtle bg-panel-elevated text-secondary hover:border-highlight hover:bg-panel-hover hover:text-paper',
  );
  if (href) {
    if (href.startsWith('/') && !href.startsWith('//')) {
      return (
        <Link href={href} className={cls} onClick={onClick}>
          {label}
        </Link>
      );
    }
    const external = /^https?:\/\//.test(href);
    return (
      <a href={href} className={cls} onClick={onClick} {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}>
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {label}
    </button>
  );
}

/** Standard /robo HUD container: 1px #262522 border, header bar with icon + .hud-label + action pills. */
export function HudPanel({ title, icon, actions, headerExtra, className, bodyClassName, children }: HudPanelProps) {
  return (
    <section aria-label={title} className={cn('hud-card flex min-h-0 flex-col overflow-hidden', className)}>
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-subtle px-3">
        {icon && (
          <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center text-orange [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        )}
        <h2 className="hud-label min-w-0 truncate">{title}</h2>
        {headerExtra && <div className="flex min-w-0 items-center gap-1.5">{headerExtra}</div>}
        {actions && actions.length > 0 && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {actions.map((a) => (
              <HudPill key={a.label} {...a} />
            ))}
          </div>
        )}
      </header>
      <div className={cn('min-h-0 flex-1', bodyClassName)}>{children}</div>
    </section>
  );
}

export default HudPanel;
