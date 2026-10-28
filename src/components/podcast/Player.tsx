'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FastForward, Pause, Play, Rewind } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtDuration } from './podcast-client';

const SPEEDS = [0.9, 1, 1.15, 1.25, 1.5, 1.75, 2];

/** Custom player over a native <audio> element (Range streaming, seeking, speed, 15s/30s skips). */
export function Player({ src, title, durationHint }: { src: string; title: string; durationHint: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(durationHint);
  const [speed, setSpeed] = useState(1);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setPlaying(false);
    setT(0);
    setDur(durationHint);
    setErr(null);
  }, [src, durationHint]);

  const toggle = useCallback(() => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play().catch((e: Error) => setErr(e.message));
    else a.pause();
  }, []);
  const skip = (d: number) => {
    const a = ref.current;
    if (a) a.currentTime = Math.min(Math.max(0, a.currentTime + d), a.duration || Infinity);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.key === ' ') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'ArrowLeft') skip(-15);
      else if (e.key === 'ArrowRight') skip(30);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const btn = 'inline-flex h-9 w-9 items-center justify-center rounded-full border border-subtle text-secondary transition-colors hover:border-highlight hover:text-paper';
  return (
    <div className="rounded-lg border border-subtle bg-panel p-4">
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDur(e.currentTarget.duration)}
        onError={() => setErr('Could not load the audio. Check the episode source is reachable.')}
      />
      <p className="truncate text-[15px] font-semibold text-paper">{title}</p>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={() => skip(-15)} className={btn} aria-label="Back 15 seconds" title="Back 15 s (left arrow)">
          <Rewind className="h-4 w-4" />
        </button>
        <button type="button" onClick={toggle} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-orange text-obsidian transition-transform hover:scale-105" aria-label={playing ? 'Pause' : 'Play'} title="Play / pause (space)">
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
        <button type="button" onClick={() => skip(30)} className={btn} aria-label="Forward 30 seconds" title="Forward 30 s (right arrow)">
          <FastForward className="h-4 w-4" />
        </button>
        <span className="w-12 text-right font-mono text-[11px] text-secondary">{fmtDuration(t)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, dur)}
          step={1}
          value={Math.min(t, dur)}
          onChange={(e) => {
            const a = ref.current;
            if (a) a.currentTime = Number(e.target.value);
            setT(Number(e.target.value));
          }}
          aria-label="Seek"
          className="h-1 min-w-0 flex-1 cursor-pointer accent-[#FF5500]"
        />
        <span className="w-12 font-mono text-[11px] text-muted">{fmtDuration(dur)}</span>
        <select
          value={speed}
          onChange={(e) => {
            const v = Number(e.target.value);
            setSpeed(v);
            if (ref.current) ref.current.playbackRate = v;
          }}
          aria-label="Playback speed"
          className="h-8 rounded-md border border-subtle bg-panel-elevated px-1.5 font-mono text-[11px] text-secondary"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
        <a href={`${src}${src.includes('?') ? '&' : '?'}download=1`} download aria-label="Download episode" title="Download mp3" className={btn}>
          <Download className="h-4 w-4" />
        </a>
      </div>
      {err && <p className={cn('mt-2 font-mono text-[11px] text-[#EF4444]')}>{err}</p>}
    </div>
  );
}
