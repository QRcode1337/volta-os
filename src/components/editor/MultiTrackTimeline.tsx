'use client';

import { Layers, Maximize2, X } from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { cn } from '@/lib/cn';
import type { EditorClip, EditorPin } from './types';

const LABEL_W = 136;
const RULER_H = 20;
const MAX_PPS = 80;
const TRACKS = ['01 A-ROLL / CUTS', '02 ANIMATIONS (/animate)', '03 AUDIO', '04 SPATIAL PINS'] as const;

const mmss = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

interface TracksProps {
  clips: EditorClip[];
  pins: EditorPin[];
  pps: number;
  isolatedId: string | null;
  trackH: number;
  onPinClick: (id: string) => void;
  onClipDoubleClick: (id: string) => void;
}

const Tracks = memo(function Tracks({ clips, pins, pps, isolatedId, trackH, onPinClick, onClipDoubleClick }: TracksProps) {
  const dim = (c: EditorClip) => (isolatedId && isolatedId !== c.id ? 'opacity-35' : '');
  return (
    <>
      {/* 01 A-ROLL / CUTS */}
      <div className="relative border-b border-subtle" style={{ height: trackH }}>
        {clips.map((c) => (
          <div
            key={c.id}
            onDoubleClick={() => onClipDoubleClick(c.id)}
            title={`File ${String(c.number).padStart(2, '0')} · ${c.name} (${mmss(c.durationSec)}) — double-click to isolate`}
            className={cn(
              'absolute inset-y-1 overflow-hidden rounded-[3px] border px-1.5 transition-opacity',
              c.kind === 'A-ROLL CUT' ? 'border-teal/60 bg-teal/15' : 'border-highlight bg-panel-elevated',
              isolatedId === c.id && 'ring-1 ring-orange',
              dim(c),
            )}
            style={{ left: c.startSec * pps, width: Math.max(2, c.durationSec * pps - 1) }}
          >
            <div className="truncate pt-0.5 font-mono text-[9.5px] font-semibold text-paper">
              File {String(c.number).padStart(2, '0')}: {c.title}
            </div>
            <div className="truncate font-mono text-[8.5px] text-muted">{mmss(c.durationSec)}</div>
            <span className="absolute inset-y-0 right-0 w-[2px] bg-paper/40" />
          </div>
        ))}
      </div>
      {/* 02 ANIMATIONS: rendered Remotion / HyperFrames / generated video (the source project that /animate edits) */}
      <div className="relative border-b border-subtle" style={{ height: trackH }}>
        {clips
          .filter((c) => c.kind === 'ANIMATION')
          .map((c) => (
            <div
              key={c.id}
              className={cn('absolute inset-y-1.5 overflow-hidden rounded-[3px] border border-orange/70 bg-orange/20 px-1.5 transition-opacity', dim(c))}
              style={{ left: c.startSec * pps, width: Math.max(2, c.durationSec * pps - 1) }}
              title={`Source: ${c.animationLabel}`}
            >
              <div className="truncate pt-0.5 font-mono text-[9.5px] font-semibold text-orange">[Anim: {c.animationLabel}]</div>
            </div>
          ))}
      </div>
      {/* 03 AUDIO: one bar per file (ffprobe says whether it has an audio stream); no synthetic waveform */}
      <div className="relative border-b border-subtle" style={{ height: trackH }}>
        {clips.map((c) => {
          const audible = c.media === 'audio' || (c.media === 'video' && c.hasAudio);
          return (
            <div
              key={c.id}
              className={cn(
                'absolute inset-y-2 flex items-center overflow-hidden rounded-[3px] border px-1.5 transition-opacity',
                audible ? 'border-teal/50 bg-teal/15' : 'border-dashed border-subtle bg-transparent',
                dim(c),
              )}
              style={{ left: c.startSec * pps, width: Math.max(2, c.durationSec * pps - 1) }}
              title={audible ? `${c.name}: audio stream present` : c.media === 'image' ? 'Still image (no audio)' : `${c.name}: no audio stream`}
            >
              <span className={cn('truncate font-mono text-[9px]', audible ? 'text-teal' : 'text-muted')}>{audible ? (c.media === 'audio' ? 'audio file' : 'audio') : c.media === 'image' ? 'still' : 'no audio'}</span>
            </div>
          );
        })}
      </div>
      {/* 04 SPATIAL PINS */}
      <div className="relative" style={{ height: trackH }}>
        {pins.map((p) => (
          <button
            key={p.id}
            type="button"
            data-pin
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onPinClick(p.id)}
            title={`Pin #${p.number} @ ${p.formattedTime} — ${p.commentText}`}
            className="group absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: p.timestampSec * pps }}
          >
            <span className={cn('block h-3 w-3 rotate-45 border border-obsidian shadow transition-transform group-hover:scale-125', p.resolved ? 'bg-green/70' : 'bg-orange')} />
            <span className={cn('mt-0.5 font-mono text-[9px] font-bold', p.resolved ? 'text-green/80' : 'text-orange')}>#{p.number}</span>
          </button>
        ))}
      </div>
    </>
  );
});

export interface MultiTrackTimelineProps {
  clips: EditorClip[];
  pins: EditorPin[];
  playhead: number;
  playing: boolean;
  total: number;
  isolate: { clipId: string | null; nonce: number } | null;
  focusClipId: string | null;
  onSeek: (t: number) => void;
  onPinClick: (id: string) => void;
  onIsolateClip: (id: string) => void;
  onClearFocus: () => void;
}

export function MultiTrackTimeline({ clips, pins, playhead, playing, total, isolate, focusClipId, onSeek, onPinClick, onIsolateClip, onClearFocus }: MultiTrackTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(0);
  const [bodyH, setBodyH] = useState(160);
  const [pps, setPps] = useState(2);
  const fitted = useRef(false);
  const scrubbing = useRef<number | null>(null);
  const fitPps = Math.max(0.05, (viewW - 24) / Math.max(1, total));

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewW(el.clientWidth);
      setBodyH(el.clientHeight);
    });
    ro.observe(el);
    setViewW(el.clientWidth);
    setBodyH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // initial fit + never zoom out past "fit"
  useEffect(() => {
    if (!fitted.current && viewW > 100) {
      fitted.current = true;
      setPps(fitPps);
    } else if (pps < fitPps) setPps(fitPps);
  }, [fitPps, viewW, pps]);

  // isolate / un-isolate requests from the bin
  useEffect(() => {
    if (!isolate) return;
    const el = scrollRef.current;
    const c = isolate.clipId ? clips.find((x) => x.id === isolate.clipId) : null;
    if (!c) {
      setPps(fitPps);
      if (el) el.scrollLeft = 0;
      return;
    }
    const next = Math.min(MAX_PPS, Math.max(fitPps, ((viewW - 24) * 0.92) / c.durationSec));
    setPps(next);
    requestAnimationFrame(() => {
      if (el) el.scrollLeft = Math.max(0, c.startSec * next - (viewW - 24) * 0.04);
    });
  }, [isolate?.nonce]);

  // auto-follow the playhead during playback
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing || scrubbing.current !== null) return;
    const x = playhead * pps;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - el.clientWidth * 0.2);
  }, [playhead, pps, playing]);

  // ctrl/⌘-wheel zoom around cursor; plain vertical wheel scrolls horizontally
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  const fitRef = useRef(fitPps);
  fitRef.current = fitPps;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const tAtCursor = (el.scrollLeft + cursorX) / ppsRef.current;
        const factor = Math.exp(-e.deltaY * 0.0022);
        const next = Math.min(MAX_PPS, Math.max(fitRef.current, ppsRef.current * factor));
        setPps(next);
        requestAnimationFrame(() => {
          el.scrollLeft = Math.max(0, tAtCursor * next - cursorX);
        });
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const timeAt = (clientX: number) => {
    const r = contentRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.max(0, Math.min(total, (clientX - r.left) / pps));
  };
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-pin]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubbing.current = e.pointerId;
    onSeek(timeAt(e.clientX));
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (scrubbing.current === e.pointerId) onSeek(timeAt(e.clientX));
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (scrubbing.current === e.pointerId) scrubbing.current = null;
  };

  // ruler ticks
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  const tick = steps.find((s) => s * pps >= 64) ?? 600;
  const ticks: number[] = [];
  for (let t = 0; t <= total + 0.001; t += tick) ticks.push(t);
  const trackH = Math.max(22, Math.floor((bodyH - RULER_H - 10) / 4));
  const contentW = total * pps + 24;

  const zoomSlider = Math.log(pps / fitPps) / Math.log(Math.max(1.0001, MAX_PPS / fitPps));
  const setZoomFromSlider = useCallback(
    (v: number) => {
      const el = scrollRef.current;
      const centerT = el ? (el.scrollLeft + el.clientWidth / 2) / pps : 0;
      const next = fitPps * Math.pow(MAX_PPS / fitPps, v);
      setPps(next);
      requestAnimationFrame(() => {
        if (el) el.scrollLeft = Math.max(0, centerT * next - el.clientWidth / 2);
      });
    },
    [fitPps, pps],
  );

  const isolatedClip = focusClipId ? clips.find((c) => c.id === focusClipId) : null;

  return (
    <section className="hud-card flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-subtle px-3">
        <Layers size={14} className="text-orange" />
        <h2 className="hud-label">Multi-Track Timeline</h2>
        <span className="font-mono text-[10px] text-muted">
          {clips.length} {clips.length === 1 ? 'file' : 'files'} · {pins.length} pins · {mmss(total)}
        </span>
        {isolatedClip && (
          <span className="flex items-center gap-1 rounded-full border border-orange/50 bg-orange/10 px-2 py-0.5 font-mono text-[10px] text-orange">
            Isolated: File {String(isolatedClip.number).padStart(2, '0')}
            <button type="button" onClick={onClearFocus} aria-label="Clear isolation" className="hover:text-paper">
              <X size={11} />
            </button>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden font-mono text-[9.5px] text-muted lg:inline">⌘/Ctrl + wheel to zoom</span>
          <span className="font-mono text-[10px] text-secondary">ZOOM</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={Number.isFinite(zoomSlider) ? Math.max(0, Math.min(1, zoomSlider)) : 0}
            onChange={(e) => setZoomFromSlider(Number(e.target.value))}
            className="h-1 w-36 accent-[#FF5500]"
            aria-label="Timeline zoom"
          />
          <button type="button" onClick={() => setZoomFromSlider(0)} title="Fit whole timeline" className="rounded p-1 text-secondary hover:bg-panel-hover hover:text-paper">
            <Maximize2 size={12} />
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="shrink-0 border-r border-subtle" style={{ width: LABEL_W }}>
          <div style={{ height: RULER_H }} className="border-b border-subtle" />
          {TRACKS.map((t) => (
            <div key={t} className="flex items-center border-b border-subtle px-2 font-mono text-[9.5px] font-semibold tracking-wide text-secondary last:border-b-0" style={{ height: trackH }}>
              {t}
            </div>
          ))}
        </div>
        <div ref={scrollRef} className="hud-scroll relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div ref={contentRef} className="relative h-full cursor-col-resize" style={{ width: contentW }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            {/* ruler */}
            <div className="relative border-b border-subtle bg-panel-elevated/60" style={{ height: RULER_H }}>
              {ticks.map((t) => (
                <div key={t} className="absolute top-0 h-full border-l border-highlight pl-1 font-mono text-[9px] leading-[20px] text-muted" style={{ left: t * pps }}>
                  {mmss(t)}
                </div>
              ))}
            </div>
            <Tracks clips={clips} pins={pins} pps={pps} isolatedId={focusClipId} trackH={trackH} onPinClick={onPinClick} onClipDoubleClick={onIsolateClip} />
            {/* playhead */}
            <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: playhead * pps }}>
              <div className="absolute -left-[5px] top-0 h-3 w-[11px] rounded-b-sm bg-orange" />
              <div className="absolute inset-y-0 left-0 w-px bg-orange shadow-[0_0_6px_#FF5500]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
