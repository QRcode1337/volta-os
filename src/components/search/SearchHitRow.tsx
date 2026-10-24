'use client';
import type { MouseEvent, ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Range, SearchHit } from '@/lib/server/search/types';
import { cn } from '@/lib/cn';
import { SOURCE_META, openHref, whenLabel, whenTitle, type Navigator } from './search-client';

/** `text` with the server-computed [start, end) ranges wrapped in <mark>. */
export function HitText({ text, ranges }: { text: string; ranges: Range[] }) {
  if (!ranges.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let i = 0;
  for (const [s0, e0] of ranges) {
    const s = Math.max(i, Math.min(s0, text.length));
    const e = Math.min(Math.max(e0, s), text.length);
    if (e <= s) continue;
    if (s > i) parts.push(text.slice(i, s));
    parts.push(
      <mark key={s} className="rounded-[2px] bg-orange/30 px-px text-paper">
        {text.slice(s, e)}
      </mark>,
    );
    i = e;
  }
  if (i < text.length) parts.push(text.slice(i));
  return <>{parts}</>;
}

const plainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

export interface SearchHitRowProps {
  hit: SearchHit;
  active: boolean;
  nowMs: number;
  router: Navigator;
  /** Palette rows: one-line snippet, no source icon (the group header has it). */
  compact?: boolean;
  showSource?: boolean;
  onHover?: () => void;
  onOpened?: (hit: SearchHit) => void;
  domId?: string;
}

/**
 * One result. Rendered as a real link (so ⌘-click / middle-click open a new tab) whose plain clicks on in-app
 * routes go through the router; keyboard opening is handled by the list owner via openHit().
 */
export function SearchHitRow({ hit, active, nowMs, router, compact, showSource, onHover, onOpened, domId }: SearchHitRowProps) {
  const meta = SOURCE_META[hit.source];
  const when = whenLabel(hit.when, nowMs);
  const internal = !!hit.href && !hit.external && hit.href.startsWith('/');
  const body = (
    <>
      <span className="flex min-w-0 items-baseline gap-2">
        {showSource && <meta.icon className="h-3.5 w-3.5 shrink-0 translate-y-0.5" style={{ color: meta.color }} aria-hidden />}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-paper">
          <HitText text={hit.title} ranges={hit.titleHighlights} />
        </span>
        {hit.meta.slice(0, compact ? 1 : 3).map((m) => (
          <span key={m} className="hidden max-w-[160px] shrink-0 truncate rounded-full border border-subtle px-1.5 py-px font-mono text-[9.5px] text-muted sm:inline">
            {m}
          </span>
        ))}
        {when && (
          <span className="shrink-0 font-mono text-[10px] text-muted" title={whenTitle(hit.when)}>
            {when}
          </span>
        )}
        {hit.external && hit.href && <ArrowUpRight className="h-3 w-3 shrink-0 text-muted" aria-label="opens outside VOLTA OS" />}
      </span>
      {hit.snippet && (
        <span className={cn('mt-0.5 block text-[12px] leading-snug text-secondary [overflow-wrap:anywhere]', compact ? 'truncate' : 'line-clamp-2')}>
          <HitText text={hit.snippet} ranges={hit.highlights} />
        </span>
      )}
    </>
  );

  const cls = cn(
    'relative block w-full min-w-0 rounded-lg border px-3 py-2 text-left transition-colors outline-none',
    active ? 'border-orange/45 bg-orange/[0.07]' : 'border-transparent hover:bg-panel-hover',
    !hit.href && 'cursor-default',
  );

  return (
    <div role="option" aria-selected={active} id={domId} className="group relative" onMouseMove={onHover}>
      {hit.href ? (
        <a
          href={hit.href}
          target={/^https?:/i.test(hit.href) ? '_blank' : undefined}
          rel={/^https?:/i.test(hit.href) ? 'noopener noreferrer' : undefined}
          tabIndex={-1}
          className={cls}
          onClick={(e) => {
            onOpened?.(hit);
            if (internal && plainClick(e)) {
              e.preventDefault();
              openHref(hit.href!, false, router);
            }
          }}
        >
          {body}
        </a>
      ) : (
        <div className={cls} title="No link for this result">
          {body}
        </div>
      )}
      {hit.secondary && !compact && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            onOpened?.(hit);
            openHref(hit.secondary!.href, hit.secondary!.external, router);
          }}
          title={`${hit.secondary.label} (⌘Enter)`}
          className={cn(
            'absolute bottom-2 right-2 flex items-center gap-1 rounded-full border border-subtle bg-panel-elevated px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted transition-opacity hover:text-paper',
            active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100',
          )}
        >
          {hit.secondary.label}
          <ArrowUpRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
