'use client';

// VOLTA Editor — Edit mode preview: transport under the viewer (same visual language as ../../TransportBar.tsx).
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Pause, Play, Repeat, StepBack, StepForward } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { fmtTC } from '@/lib/nle/model';

function TBtn({ title, onClick, children, active, primary, disabled }: { title: string; onClick: () => void; children: ReactNode; active?: boolean; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border px-2 font-mono text-[10px] font-semibold transition-colors disabled:opacity-40',
        primary && 'border-orange bg-orange px-3 text-obsidian hover:brightness-110',
        !primary && active && 'border-orange/70 bg-orange/15 text-orange',
        !primary && !active && 'border-subtle bg-panel-elevated text-secondary hover:border-highlight hover:text-paper',
      )}
    >
      {children}
    </button>
  );
}

export interface TransportProps {
  playhead: number;
  total: number;
  fps: number;
  playing: boolean;
  loop: boolean;
  buffering: boolean;
  onTogglePlay: () => void;
  onSeek: (t: number) => void;
  onStep: (frames: number) => void;
  onPrevEdit: () => void;
  onNextEdit: () => void;
  onLoop: () => void;
}

export function Transport(p: TransportProps) {
  const empty = p.total <= 0;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-subtle px-3 py-2">
      <TBtn title="Jump to start (Home)" onClick={() => p.onSeek(0)} disabled={empty}>
        <ChevronFirst size={13} />
      </TBtn>
      <TBtn title="Previous edit point (↑)" onClick={p.onPrevEdit} disabled={empty}>
        <StepBack size={13} />
      </TBtn>
      <TBtn title="Step back 1 frame (←)" onClick={() => p.onStep(-1)} disabled={empty}>
        <ChevronLeft size={13} />
        -1f
      </TBtn>
      <TBtn title={p.playing ? 'Pause (Space)' : 'Play (Space)'} onClick={p.onTogglePlay} primary disabled={empty}>
        {p.playing ? <Pause size={13} /> : <Play size={13} />}
        {p.playing ? 'PAUSE' : 'PLAY'}
      </TBtn>
      <TBtn title="Step forward 1 frame (→)" onClick={() => p.onStep(1)} disabled={empty}>
        +1f
        <ChevronRight size={13} />
      </TBtn>
      <TBtn title="Next edit point (↓)" onClick={p.onNextEdit} disabled={empty}>
        <StepForward size={13} />
      </TBtn>
      <TBtn title="Jump to end (End)" onClick={() => p.onSeek(p.total)} disabled={empty}>
        <ChevronLast size={13} />
      </TBtn>
      <div className="mx-1 flex items-baseline gap-1 rounded-md border border-subtle bg-obsidian px-2 py-1">
        <span className="font-doto text-[15px] font-bold tabular-nums text-orange">{fmtTC(p.playhead, p.fps)}</span>
        <span className="font-doto text-[11px] text-muted">/ {fmtTC(p.total, p.fps)}</span>
      </div>
      {p.buffering && <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-amber">Buffering…</span>}
      <div className="ml-auto flex items-center gap-1.5">
        <span className="hidden font-mono text-[10px] text-muted lg:inline">{Math.round(p.fps)} fps</span>
        <TBtn title="Loop playback" onClick={p.onLoop} active={p.loop}>
          <Repeat size={13} /> Loop
        </TBtn>
      </div>
    </div>
  );
}
