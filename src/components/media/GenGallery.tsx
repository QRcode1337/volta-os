'use client';
import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Copy, FolderOpen, Send, X } from 'lucide-react';
import type { GenItemRecord } from '@/types/media';
import { cn } from '@/lib/cn';
import { KIND_LABEL, fmtBytes, fmtDate, fmtUsd } from './gen-client';
import { mediaFileUrl } from '@/lib/media-ids';
import { Modal } from './ui';

export interface ItemActions {
  onOpen: (id: string) => void;
  onSend: (it: GenItemRecord) => void;
  onCopyPath: (it: GenItemRecord) => void;
  onReveal: (it: GenItemRecord) => void;
}

const chip = 'rounded-full border border-subtle bg-panel-elevated px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.05em] text-secondary';
const actionBtn =
  'inline-flex h-7 items-center gap-1 rounded-full border border-subtle px-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] text-secondary transition-colors hover:border-highlight hover:text-paper';

function Media({ it, large, hover }: { it: GenItemRecord; large?: boolean; hover?: boolean }) {
  const src = mediaFileUrl(`g_${it.id}`);
  const ref = useRef<HTMLVideoElement>(null);
  if (it.kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={it.prompt} loading="lazy" className={cn('block w-full', large ? 'max-h-[68vh] object-contain' : 'h-auto')} />;
  }
  if (it.kind === 'video') {
    return (
      <video
        ref={ref}
        src={src}
        preload="metadata"
        muted={!large}
        loop={!large}
        playsInline
        controls={large}
        autoPlay={large}
        onMouseEnter={hover ? () => void ref.current?.play().catch(() => {}) : undefined}
        onMouseLeave={hover ? () => ref.current?.pause() : undefined}
        className={cn('block w-full bg-black', large ? 'max-h-[68vh]' : 'h-auto')}
      />
    );
  }
  return (
    <div className={cn('flex flex-col justify-center gap-3 bg-gradient-to-br from-purple/10 via-panel-elevated to-panel p-4', large ? 'min-h-[220px] min-w-[420px]' : '')}>
      <div className="flex h-10 items-end gap-[3px]" aria-hidden>
        {Array.from({ length: 36 }, (_, i) => (
          <span key={i} className="w-[3px] rounded-sm bg-purple/60" style={{ height: `${18 + Math.abs(Math.sin(i * 1.7 + it.bytes)) * 82}%` }} />
        ))}
      </div>
      <audio src={src} controls preload="none" autoPlay={large} className="h-8 w-full" />
    </div>
  );
}

export function GenCard({ it, actions }: { it: GenItemRecord; actions: ItemActions }) {
  return (
    <article className="hud-card mb-4 inline-block w-full break-inside-avoid overflow-hidden transition-colors hover:border-highlight">
      <div
        className={cn('group relative bg-obsidian', it.kind !== 'voice' && 'cursor-zoom-in')}
        onClick={it.kind === 'voice' ? undefined : () => actions.onOpen(it.id)}
      >
        <Media it={it} hover />
        <span className={cn(chip, 'absolute left-2 top-2 border-orange/50 bg-black/70 text-orange')}>{KIND_LABEL[it.kind]}</span>
      </div>
      <div className="space-y-2 p-3">
        <p className="line-clamp-2 text-[12.5px] leading-snug text-paper" title={it.prompt}>
          {it.prompt}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={chip}>{it.model}</span>
          <span className={cn(chip, 'text-green')}>est. {fmtUsd(it.estUsd)}</span>
          <span className={chip}>{fmtBytes(it.bytes)}</span>
          <span className="ml-auto font-mono text-[9.5px] text-muted">{fmtDate(it.created)}</span>
        </div>
        <ItemButtons it={it} actions={actions} />
      </div>
    </article>
  );
}

function ItemButtons({ it, actions }: { it: GenItemRecord; actions: ItemActions }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {it.kind !== 'voice' && (
        <button type="button" className={cn(actionBtn, 'border-orange/40 text-orange hover:border-orange')} onClick={() => actions.onSend(it)} title="Add to the VOLTA Editor inbox">
          <Send className="h-3 w-3" /> Editor
        </button>
      )}
      <button type="button" className={actionBtn} onClick={() => actions.onCopyPath(it)} title={it.file}>
        <Copy className="h-3 w-3" /> Path
      </button>
      <button type="button" className={actionBtn} onClick={() => actions.onReveal(it)}>
        <FolderOpen className="h-3 w-3" /> Reveal
      </button>
    </div>
  );
}

export function PendingCard({ label, progress }: { label: string; progress: string }) {
  return (
    <article className="hud-card media-shimmer relative mb-4 inline-block w-full break-inside-avoid overflow-hidden">
      <div className="flex aspect-video items-center justify-center bg-obsidian">
        <span className="font-doto text-3xl text-orange">...</span>
      </div>
      <div className="space-y-1 p-3">
        <p className="text-[12.5px] text-paper">{label}</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted">{progress}</p>
      </div>
    </article>
  );
}

export function Lightbox({
  item,
  onClose,
  onStep,
  actions,
}: {
  item: GenItemRecord | null;
  onClose: () => void;
  onStep: (dir: 1 | -1) => void;
  actions: ItemActions;
}) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onStep(-1);
      else if (e.key === 'ArrowRight') onStep(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onStep]);
  if (!item) return null;
  return (
    <Modal open onClose={onClose} label="Generation preview" className="flex max-w-[min(1100px,94vw)] flex-col">
      <div className="relative flex items-center justify-center bg-black">
        <Media it={item} large />
        <button type="button" onClick={() => onStep(-1)} aria-label="Previous" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-paper hover:bg-black/80">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => onStep(1)} aria-label="Next" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-paper hover:bg-black/80">
          <ChevronRight className="h-5 w-5" />
        </button>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-paper hover:bg-black/80">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="hud-scroll max-h-[22vh] space-y-2 overflow-y-auto border-t border-subtle p-4">
        <p className="text-[13px] leading-snug text-paper">{item.prompt}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={chip}>{KIND_LABEL[item.kind]}</span>
          <span className={chip}>{item.provider}</span>
          <span className={chip}>{item.model}</span>
          <span className={cn(chip, 'text-green')}>est. {fmtUsd(item.estUsd)}</span>
          <span className={chip}>{fmtBytes(item.bytes)}</span>
          <span className="font-mono text-[10px] text-muted">{fmtDate(item.created)}</span>
        </div>
        <p className="break-all font-mono text-[10px] text-muted">{item.file}</p>
        <ItemButtons it={item} actions={actions} />
      </div>
    </Modal>
  );
}
