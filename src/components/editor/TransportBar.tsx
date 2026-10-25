'use client';

import { ChevronLeft, ChevronRight, Crosshair, Pause, Play, Repeat, SkipBack, SkipForward, Square } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatTimecode } from '@/lib/format';
import type { PinMode, PlaybackSpeed } from './types';

const SPEEDS: PlaybackSpeed[] = [0.5, 1, 1.5, 2];

function TBtn({ title, onClick, children, active, primary }: { title: string; onClick: () => void; children: ReactNode; active?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        'flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border px-2 font-mono text-[10px] font-semibold transition-colors',
        primary && 'border-orange bg-orange px-3 text-obsidian hover:brightness-110',
        !primary && active && 'border-orange/70 bg-orange/15 text-orange',
        !primary && !active && 'border-subtle bg-panel-elevated text-secondary hover:border-highlight hover:text-paper',
      )}
    >
      {children}
    </button>
  );
}

export interface TransportBarProps {
  playhead: number;
  total: number;
  /** Frame rate of the file under the playhead (ffprobe). */
  fps: number;
  playing: boolean;
  speed: PlaybackSpeed;
  loop: boolean;
  mode: PinMode;
  onTogglePlay: () => void;
  onStep: (frames: number) => void;
  onClipStart: () => void;
  onNextPin: () => void;
  onSpeed: (s: PlaybackSpeed) => void;
  onLoop: () => void;
  onMode: (m: PinMode) => void;
}

export function TransportBar(p: TransportBarProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-subtle px-3 py-2">
      <TBtn title="Jump to file start" onClick={p.onClipStart}>
        <SkipBack size={13} />
      </TBtn>
      <TBtn title="Step back 1 frame (←)" onClick={() => p.onStep(-1)}>
        <ChevronLeft size={13} />
        -1f
      </TBtn>
      <TBtn title={p.playing ? 'Pause (Space)' : 'Play (Space)'} onClick={p.onTogglePlay} primary>
        {p.playing ? <Pause size={13} /> : <Play size={13} />}
        {p.playing ? 'PAUSE' : 'PLAY'}
      </TBtn>
      <TBtn title="Step forward 1 frame (→)" onClick={() => p.onStep(1)}>
        +1f
        <ChevronRight size={13} />
      </TBtn>
      <TBtn title="Jump to next pin (N)" onClick={p.onNextPin}>
        <SkipForward size={13} /> PIN
      </TBtn>
      <div className="mx-1 flex items-baseline gap-1 rounded-md border border-subtle bg-obsidian px-2 py-1">
        <span className="font-doto text-[15px] font-bold tabular-nums text-orange">{formatTimecode(p.playhead + 1e-6, Math.round(p.fps))}</span>
        <span className="font-doto text-[11px] text-muted">/ {formatTimecode(p.total, Math.round(p.fps))}</span>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <TBtn title="Point pin mode — click the frame to drop a pin" onClick={() => p.onMode('point')} active={p.mode === 'point'}>
          <Crosshair size={13} /> Pin
        </TBtn>
        <TBtn title="Region box mode — drag across the frame" onClick={() => p.onMode('box')} active={p.mode === 'box'}>
          <Square size={12} /> Box
        </TBtn>
        <label className="flex h-7 items-center gap-1 rounded-md border border-subtle bg-panel-elevated px-1.5 font-mono text-[10px] text-secondary" title="Playback speed">
          🔊
          <select
            value={p.speed}
            onChange={(e) => p.onSpeed(Number(e.target.value) as PlaybackSpeed)}
            className="bg-transparent text-paper outline-none"
            aria-label="Playback speed"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s} className="bg-panel">
                {s.toFixed(1)}x
              </option>
            ))}
          </select>
        </label>
        <TBtn title="Loop current file" onClick={p.onLoop} active={p.loop}>
          <Repeat size={13} /> Loop
        </TBtn>
      </div>
    </div>
  );
}
