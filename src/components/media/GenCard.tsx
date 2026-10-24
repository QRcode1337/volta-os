'use client';
import { memo } from 'react';
import { ArtCanvas } from './ArtCanvas';
import { ASPECT_BY_ID, MODEL_BY_ID, type GenItem } from './data';
import { cn } from '@/lib/cn';
import { formatUsd } from '@/lib/format';

export function VariantBadge({ variant, size = 'sm' }: { variant: GenItem['variant']; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-5 px-2 text-[9px]' : 'h-6 px-2.5 text-[10px]';
  return variant === 'wildcard' ? (
    <span className={cn('inline-flex items-center gap-1 rounded-full border border-purple/60 bg-[#1E0F2E]/90 font-mono font-semibold uppercase tracking-[0.06em] text-purple', cls)}>
      🃏 WILDCARD
    </span>
  ) : (
    <span className={cn('inline-flex items-center gap-1 rounded-full border border-orange/60 bg-obsidian/85 font-mono font-semibold uppercase tracking-[0.06em] text-orange', cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-orange" />
      STANDARD (/robo)
    </span>
  );
}

export function MediaTypeChip({ item, playing }: { item: GenItem; playing?: boolean }) {
  if (item.mediaType !== 'animation') {
    return (
      <span className="inline-flex h-5 items-center rounded-full bg-obsidian/80 px-2 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-secondary">
        IMG · {item.aspect}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-full px-2 font-mono text-[9px] font-semibold uppercase tracking-[0.06em]',
        playing ? 'bg-orange text-obsidian' : 'bg-obsidian/80 text-amber',
      )}
    >
      {playing ? '● LIVE' : '▶'} {MODEL_BY_ID[item.model].clipSec ?? 5}s LOOP
    </span>
  );
}

export interface GenCardProps {
  item: GenItem;
  playing: boolean;
  compareMode: boolean;
  compareSlot: number; // -1 none, 0 = A, 1 = B
  promoting: boolean;
  onHover: (id: string | null) => void;
  onOpen: (id: string) => void;
  onToggleCompare: (id: string) => void;
  onPromote: (item: GenItem) => void;
  onSend: (item: GenItem) => void;
}

function GenCardImpl({ item, playing, compareMode, compareSlot, promoting, onHover, onOpen, onToggleCompare, onPromote, onSend }: GenCardProps) {
  const spec = MODEL_BY_ID[item.model];
  const selected = compareSlot >= 0;
  return (
    <article
      className={cn(
        'hud-card group mb-4 break-inside-avoid overflow-hidden transition-[border-color,box-shadow] duration-200 hover:border-highlight',
        selected && '!border-orange shadow-[0_0_0_1px_#FF5500,0_0_28px_rgba(255,85,0,0.25)]',
      )}
      style={{ animation: 'media-card-in 360ms ease-out both' }}
    >
      <button
        type="button"
        className={cn('relative block w-full overflow-hidden bg-obsidian text-left', compareMode ? 'cursor-crosshair' : 'cursor-zoom-in')}
        onMouseEnter={() => onHover(item.id)}
        onMouseLeave={() => onHover(null)}
        onClick={() => (compareMode ? onToggleCompare(item.id) : onOpen(item.id))}
        aria-label={compareMode ? `Pick ${item.prompt} for comparison` : `Open ${item.prompt}`}
      >
        <ArtCanvas item={item} width={ASPECT_BY_ID[item.aspect].w > ASPECT_BY_ID[item.aspect].h ? 640 : 480} mode={playing ? 'playing' : 'still'} className="transition-transform duration-500 group-hover:scale-[1.015]" />
        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
          <VariantBadge variant={item.variant} />
          <MediaTypeChip item={item} playing={playing} />
        </div>
        {item.promoted && (
          <span className="pointer-events-none absolute bottom-2 left-2 inline-flex h-5 items-center rounded-full bg-amber px-2 font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-obsidian">
            ★ IN /thumb DB
          </span>
        )}
        {compareMode && (
          <div className={cn('pointer-events-none absolute inset-0 flex items-center justify-center transition-colors', selected ? 'bg-orange/15' : 'bg-black/30 opacity-0 group-hover:opacity-100')}>
            <span className={cn('flex h-12 w-12 items-center justify-center rounded-full border-2 font-doto text-2xl', selected ? 'border-orange bg-orange text-obsidian' : 'border-paper/70 text-paper')}>
              {selected ? (compareSlot === 0 ? 'A' : 'B') : '+'}
            </span>
          </div>
        )}
      </button>
      <div className="space-y-2.5 p-3">
        <p className="line-clamp-2 text-[13px] leading-snug text-paper">{item.prompt}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.04em] text-muted">
          <span className="text-secondary">{spec.label}</span>
          <span>·</span>
          <span>
            SEED <span className="font-doto text-[12px] text-paper">{item.seed}</span>
          </span>
          <span>·</span>
          <span className="text-green">{formatUsd(item.cost)}</span>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={item.promoted || promoting}
            onClick={() => onPromote(item)}
            className={cn(
              'flex h-7 flex-1 items-center justify-center gap-1 rounded-md border font-mono text-[9.5px] font-semibold uppercase tracking-[0.05em] transition-colors',
              item.promoted
                ? 'cursor-default border-amber/40 bg-amber/10 text-amber'
                : 'border-subtle bg-panel-elevated text-secondary hover:border-amber/60 hover:text-amber',
            )}
          >
            {promoting ? <span className="robo-spin inline-block h-3 w-3 rounded-full border border-amber border-t-transparent" /> : '⭐'}
            {item.promoted ? 'Promoted to /thumb' : 'Promote to /thumb Database'}
          </button>
          <button
            type="button"
            onClick={() => onSend(item)}
            className={cn(
              'flex h-7 items-center justify-center rounded-md border px-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.05em] transition-colors',
              item.sentToEditor
                ? 'border-orange/40 bg-orange/10 text-orange'
                : 'border-subtle bg-panel-elevated text-secondary hover:border-orange/60 hover:text-orange',
            )}
            title="Send to VOLTA Editor"
          >
            {item.sentToEditor ? '✓ In Editor' : 'Send to VOLTA Editor'}
          </button>
        </div>
      </div>
    </article>
  );
}

export const GenCard = memo(GenCardImpl);

/** Shimmering placeholder while a batch "renders". */
export function PendingCard({ aspect, variant, seed, progress, index }: { aspect: GenItem['aspect']; variant: GenItem['variant']; seed: number; progress: number; index: number }) {
  const a = ASPECT_BY_ID[aspect];
  const local = Math.max(0, Math.min(1, progress * 1.15 - index * 0.03));
  return (
    <div className="hud-card mb-4 break-inside-avoid overflow-hidden">
      <div className="media-shimmer relative overflow-hidden bg-panel-elevated" style={{ aspectRatio: `${a.w} / ${a.h}` }}>
        <div
          className="absolute inset-0 opacity-40"
          style={{ backgroundImage: 'linear-gradient(rgba(245,242,235,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(245,242,235,0.05) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
        <div className="absolute inset-x-2 top-2">
          <VariantBadge variant={variant} />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <span className="font-doto text-3xl text-orange">{Math.round(local * 100)}%</span>
          <span className="hud-label">DIFFUSING · SEED {seed}</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-obsidian">
          <div className="h-full bg-orange transition-[width] duration-100" style={{ width: `${local * 100}%` }} />
        </div>
      </div>
      <div className="space-y-2 p-3">
        <div className="h-3 w-4/5 rounded bg-panel-elevated" />
        <div className="h-3 w-2/5 rounded bg-panel-elevated" />
      </div>
    </div>
  );
}
