'use client';
import { useEffect, useRef } from 'react';
import { ImageOff, Link2 } from 'lucide-react';
import type { LtmCaptureSummary } from '@/types/ltm';
import { cn } from '@/lib/cn';
import { appColor, dayLabel, hhmm } from './ltm-client';
import { Highlight } from './Highlight';

interface CaptureListProps {
  items: LtmCaptureSummary[];
  selectedId: number | null;
  /** The capture a deep link pointed at: marked in the list. */
  linkedId?: number | null;
  /** Scroll this row to the centre once it is rendered, then call onScrolled. */
  scrollToId?: number | null;
  onScrolled?: () => void;
  query: string;
  showDate: boolean; // search mode spans days
  onSelect: (id: number) => void;
  hasMore: boolean;
  onMore: () => void;
  loading: boolean;
}

export function CaptureList({
  items,
  selectedId,
  linkedId = null,
  scrollToId = null,
  onScrolled,
  query,
  showDate,
  onSelect,
  hasMore,
  onMore,
  loading,
}: CaptureListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const selRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  // Deep link: the row may only exist after the day loads (or after more rows render), so retry on items.
  useEffect(() => {
    if (scrollToId == null) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cid="${scrollToId}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    onScrolled?.();
  }, [scrollToId, items, onScrolled]);

  if (!items.length && !loading) {
    return <div className="flex h-full items-center justify-center font-mono text-[11px] text-muted">No captures match.</div>;
  }

  return (
    <ul ref={listRef} className="divide-y divide-subtle/60">
      {items.map((c) => {
        const sel = c.id === selectedId;
        const linked = c.id === linkedId;
        return (
          <li key={c.id}>
            <button
              ref={sel ? selRef : undefined}
              data-cid={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={cn(
                'flex w-full gap-3 px-3 py-2 text-left transition-colors',
                sel ? 'bg-orange/10 shadow-[inset_2px_0_0_#FF5500]' : 'hover:bg-panel-hover',
                linked && 'ring-1 ring-inset ring-amber/60',
              )}
            >
              <div className="w-12 shrink-0 pt-0.5 text-right">
                <div className={cn('font-mono text-[11px]', sel ? 'text-orange' : 'text-secondary')}>{hhmm(c.ts)}</div>
                {showDate && <div className="font-mono text-[9px] uppercase text-muted">{dayLabel(c.ts.slice(0, 10)).label}</div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: appColor(c.app) }} />
                  <span className="shrink-0 text-[11px] font-semibold text-paper">{c.app}</span>
                  <span className="truncate text-[11px] text-muted">
                    <Highlight text={c.title} query={query} />
                  </span>
                  {linked && (
                    <span
                      className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-amber/50 bg-amber/10 px-1.5 font-mono text-[8.5px] uppercase tracking-[0.08em] text-amber"
                      title="Opened from a link"
                    >
                      <Link2 className="h-2.5 w-2.5" /> linked
                    </span>
                  )}
                  {!c.hasFrame && <ImageOff className={cn('h-3 w-3 shrink-0 text-muted', !linked && 'ml-auto')} />}
                </div>
                {c.snippet && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-secondary">
                    <Highlight text={c.snippet} query={query} />
                  </p>
                )}
              </div>
            </button>
          </li>
        );
      })}
      {hasMore && (
        <li className="p-3 text-center">
          <button
            type="button"
            onClick={onMore}
            disabled={loading}
            className="rounded-full border border-subtle bg-panel-elevated px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-secondary hover:border-highlight hover:text-paper disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </li>
      )}
    </ul>
  );
}
