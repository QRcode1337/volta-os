'use client';
// Persistent player bar: one <audio> element, transport, volume and a Web Audio waveform of the streamed file (click / drag to seek).
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Cover } from './Cover';
import { fmtClock, trackStreamUrl } from './format';
import { WaveformSkipped, loadPeaks } from './music-client';
import type { MusicTrack } from './types';

const VOL_KEY = 'volta:music:volume';
const PLAYED = '#FF5500';
const UNPLAYED = '#524e46';
const PLACEHOLDER = '#262522';

function readVolume(): number {
  try {
    const v = Number(window.localStorage.getItem(VOL_KEY));
    return Number.isFinite(v) && v >= 0 && v <= 1 && window.localStorage.getItem(VOL_KEY) !== null ? v : 0.85;
  } catch {
    return 0.85;
  }
}

export interface PlayerBarProps {
  track: MusicTrack | null;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPlayState: (playing: boolean) => void;
  onError: (message: string) => void;
  handleRef?: Ref<PlayerHandle>;
}

export interface PlayerHandle {
  toggle: () => void;
}

type WaveState = 'idle' | 'loading' | 'ready' | 'skipped' | 'error';

export function PlayerBar({ track, hasPrev, hasNext, onPrev, onNext, onPlayState, onError, handleRef }: PlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peaksRef = useRef<Float32Array | null>(null);
  const progressRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState<number | null>(null);
  const [wave, setWave] = useState<WaveState>('idle');
  const [vol, setVol] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const cb = useRef({ onNext, onPlayState, onError });
  cb.current = { onNext, onPlayState, onError };
  const hasNextRef = useRef(hasNext);
  hasNextRef.current = hasNext;

  useEffect(() => setVol(readVolume()), []);
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : vol;
  }, [vol, muted]);

  const duration = (dur && Number.isFinite(dur) ? dur : null) ?? track?.durationSec ?? null;
  const durRef = useRef<number | null>(null);
  durRef.current = duration;

  // ── drawing ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const w = box.clientWidth;
    const h = box.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const bar = 2;
    const gap = 1;
    const n = Math.max(1, Math.floor(w / (bar + gap)));
    const peaks = peaksRef.current;
    const split = progressRef.current * n;
    for (let i = 0; i < n; i++) {
      let v: number;
      if (peaks) {
        const from = Math.floor((i / n) * peaks.length);
        const to = Math.max(from + 1, Math.floor(((i + 1) / n) * peaks.length));
        v = 0;
        for (let j = from; j < to; j++) v = Math.max(v, peaks[j]);
      } else {
        v = 0.12; // flat placeholder
      }
      const bh = Math.max(2, v * (h - 6));
      ctx.fillStyle = peaks ? (i < split ? PLAYED : UNPLAYED) : i < split ? PLAYED : PLACEHOLDER;
      ctx.fillRect(i * (bar + gap), (h - bh) / 2, bar, bh);
    }
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(box);
    return () => ro.disconnect();
  }, [draw]);

  // ── track change: load the stream and compute the waveform ──
  const trackId = track?.id;
  const trackBytes = track?.bytes ?? 0;
  const trackLocal = track?.storage === 'local';
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    peaksRef.current = null;
    progressRef.current = 0;
    setTime(0);
    setDur(null);
    draw();
    if (!trackId || !trackLocal) {
      a.pause();
      a.removeAttribute('src');
      a.load();
      setWave('idle');
      return;
    }
    a.src = trackStreamUrl(trackId);
    a.play().catch((err: unknown) => {
      if ((err as DOMException)?.name === 'AbortError') return;
      if ((err as DOMException)?.name === 'NotAllowedError') return; // autoplay blocked: user presses play
      cb.current.onError(`Could not play: ${(err as Error).message}`);
    });
    const ctl = new AbortController();
    setWave('loading');
    loadPeaks(trackId, trackBytes, ctl.signal).then(
      (p) => {
        if (ctl.signal.aborted) return;
        peaksRef.current = p;
        setWave('ready');
        draw();
      },
      (err: unknown) => {
        if (ctl.signal.aborted || (err as Error)?.name === 'AbortError') return;
        setWave(err instanceof WaveformSkipped ? 'skipped' : 'error');
      },
    );
    return () => ctl.abort();
  }, [trackId, trackBytes, trackLocal, draw]);

  // ── progress loop (canvas only; React state updates at timeupdate rate) ──
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const a = audioRef.current;
      const d = durRef.current;
      if (a && d) {
        progressRef.current = Math.min(1, a.currentTime / d);
        draw();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, draw]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !a.src) return;
    if (a.paused) a.play().catch((err: unknown) => cb.current.onError(`Could not play: ${(err as Error).message}`));
    else a.pause();
  }, []);

  useImperativeHandle(handleRef, () => ({ toggle }), [toggle]);

  const seekTo = useCallback(
    (ratio: number) => {
      const a = audioRef.current;
      const d = durRef.current;
      if (!a || !d) return;
      const r = Math.min(1, Math.max(0, ratio));
      a.currentTime = r * d;
      progressRef.current = r;
      setTime(a.currentTime);
      draw();
    },
    [draw],
  );

  const dragging = useRef(false);
  const ratioFromEvent = (e: React.PointerEvent) => {
    const rect = boxRef.current?.getBoundingClientRect();
    return rect ? (e.clientX - rect.left) / rect.width : 0;
  };

  // keyboard: space = play/pause, arrows = +-5 s
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.tagName === 'BUTTON' || el.tagName === 'A' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const a = audioRef.current;
      if (!a || !a.src) return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggle();
      } else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        const d = durRef.current;
        if (!d) return;
        e.preventDefault();
        seekTo((a.currentTime + (e.code === 'ArrowRight' ? 5 : -5)) / d);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, seekTo]);

  const ctlBtn = 'inline-flex h-8 w-8 items-center justify-center rounded-full text-secondary transition-colors hover:text-paper disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-secondary';
  const canPlay = !!track && trackLocal;

  return (
    <footer className="relative z-20 shrink-0 border-t border-subtle bg-panel/95 px-4 py-2.5 backdrop-blur" aria-label="Player">
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => {
          setPlaying(true);
          cb.current.onPlayState(true);
        }}
        onPause={() => {
          setPlaying(false);
          cb.current.onPlayState(false);
        }}
        onEnded={() => {
          if (hasNextRef.current) cb.current.onNext();
          else {
            progressRef.current = 0;
            draw();
          }
        }}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onDurationChange={(e) => setDur(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onError={() => {
          const a = audioRef.current;
          if (a?.getAttribute('src')) cb.current.onError(`The browser could not decode ${track?.fileName ?? 'this track'}.`);
        }}
      />
      <div className="flex items-center gap-4">
        <div className="flex w-[240px] min-w-0 shrink-0 items-center gap-3">
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-subtle">{track ? <Cover track={track} /> : <div className="h-full w-full bg-obsidian" />}</div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-medium text-paper" title={track?.title}>
              {track ? track.title : 'Nothing playing'}
            </p>
            <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
              {track ? `${track.format}${track.bitrateKbps ? ` · ${track.bitrateKbps} kbps` : ''}` : 'Pick a downloaded track'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className={ctlBtn} onClick={onPrev} disabled={!hasPrev} aria-label="Previous track">
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggle}
            disabled={!canPlay}
            aria-label={playing ? 'Pause' : 'Play'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-orange text-black transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:bg-panel-elevated disabled:text-muted disabled:hover:scale-100"
          >
            {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
          </button>
          <button type="button" className={ctlBtn} onClick={onNext} disabled={!hasNext} aria-label="Next track">
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-secondary">{fmtClock(canPlay ? time : null)}</span>
        <div
          ref={boxRef}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration ?? 0)}
          aria-valuenow={Math.round(time)}
          tabIndex={-1}
          className={cn('relative h-12 min-w-0 flex-1 touch-none select-none', canPlay && duration ? 'cursor-pointer' : 'cursor-default')}
          onPointerDown={(e) => {
            if (!canPlay) return;
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            seekTo(ratioFromEvent(e));
          }}
          onPointerMove={(e) => {
            if (dragging.current) seekTo(ratioFromEvent(e));
          }}
          onPointerUp={(e) => {
            dragging.current = false;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
        >
          <canvas ref={canvasRef} className={cn('absolute inset-0 h-full w-full', wave === 'loading' && 'animate-pulse')} />
          {(wave === 'skipped' || wave === 'error' || !track) && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
              {!track ? 'waveform' : wave === 'skipped' ? 'file too large for a waveform' : 'waveform unavailable'}
            </span>
          )}
          {track && !trackLocal && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.06em] text-amber">In iCloud: download it to play</span>
          )}
        </div>
        <span className="w-10 shrink-0 font-mono text-[11px] tabular-nums text-muted">{fmtClock(duration)}</span>

        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <button type="button" className={ctlBtn} onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted || vol === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : vol}
            aria-label="Volume"
            onChange={(e) => {
              const v = Number(e.target.value);
              setVol(v);
              setMuted(false);
              try {
                window.localStorage.setItem(VOL_KEY, String(v));
              } catch {
                // storage unavailable
              }
            }}
            className="h-1 w-24 cursor-pointer accent-[#FF5500]"
          />
        </div>
      </div>
    </footer>
  );
}
