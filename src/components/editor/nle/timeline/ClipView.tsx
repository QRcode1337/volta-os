'use client';
// VOLTA Editor — Edit mode timeline: one clip. Display only — every interactive part carries data-hit / data-id and the
// timeline resolves pointer events itself, so this component stays memoised and takes no callbacks.
import { Link2, Type, VolumeX } from 'lucide-react';
import { memo, useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/cn';
import { fmtShort } from '@/lib/nle/model';
import type { NleClip } from '@/types/nle';
import { KIND_STYLE, ORANGE } from './constants';
import { useFilmstrip, usePeaks } from './media';

const LABEL_H = 15;
const BAND_H = 14;
const MAX_TILES = 120;
const MAX_CANVAS = 8000;

const cssUrl = (u: string) => `url("${u.replace(/["\\\n]/g, (m) => `\\${m}`)}")`;

function Filmstrip({ clip, pps, width, height }: { clip: NleClip; pps: number; width: number; height: number }) {
  const strip = useFilmstrip(clip.assetId, clip.sourceDuration);
  const tiles = useMemo(() => {
    if (!strip || height <= 0) return [];
    const tileW = Math.max(8, (strip.frameW * height) / strip.frameH);
    let n = Math.ceil(width / tileW);
    let step = tileW;
    if (n > MAX_TILES) {
      n = MAX_TILES;
      step = width / MAX_TILES;
    }
    const out: { x: number; i: number; w: number }[] = [];
    for (let j = 0; j < n; j++) {
      const x = j * step;
      const w = Math.min(tileW, width - x);
      const src = clip.mediaStart + ((x + Math.min(tileW, step) / 2) / pps) * clip.rate;
      const i = Math.max(0, Math.min(strip.count - 1, Math.floor((src / strip.duration) * strip.count)));
      out.push({ x, i, w });
    }
    return out.map((t) => ({ ...t, tileW }));
  }, [strip, width, height, pps, clip.mediaStart, clip.rate]);
  if (!strip) return <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.03)_0_44px,rgba(0,0,0,0.12)_44px_88px)]" />;
  const bg = cssUrl(strip.url);
  return (
    <div className="absolute inset-0">
      {tiles.map((t) => (
        <div
          key={t.x}
          className="absolute top-0"
          style={{ left: t.x, width: t.w, height, backgroundImage: bg, backgroundSize: `${strip.count * t.tileW}px ${height}px`, backgroundPosition: `${-t.i * t.tileW}px 0`, backgroundRepeat: 'no-repeat' }}
        />
      ))}
    </div>
  );
}

interface WaveProps {
  assetId: string | null;
  mediaStart: number;
  rate: number;
  pps: number;
  width: number;
  height: number;
  volume: number;
  muted: boolean;
  color: string;
}

function Waveform({ assetId, mediaStart, rate, pps, width, height, volume, muted, color }: WaveProps) {
  const peaks = usePeaks(assetId);
  const ref = useRef<HTMLCanvasElement>(null);
  const cw = Math.max(1, Math.min(Math.round(width), MAX_CANVAS));
  useEffect(() => {
    const cv = ref.current;
    if (!cv || height <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(height * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, height);
    ctx.fillStyle = color;
    ctx.globalAlpha = muted ? 0.28 : 1;
    const mid = height / 2;
    if (!peaks || !peaks.peaks.length) {
      ctx.fillRect(0, mid - 0.5, cw, 1);
      return;
    }
    const gain = Math.max(0, volume);
    const secPerCol = width / cw / pps; // sequence seconds per canvas column
    const n = peaks.peaks.length;
    for (let col = 0; col < cw; col++) {
      const s0 = mediaStart + col * secPerCol * rate;
      const s1 = mediaStart + (col + 1) * secPerCol * rate;
      const b0 = Math.floor(s0 * peaks.rate);
      const b1 = Math.max(b0 + 1, Math.ceil(s1 * peaks.rate));
      if (b0 >= n) break;
      let m = 0;
      for (let b = Math.max(0, b0); b < Math.min(n, b1); b++) if (peaks.peaks[b] > m) m = peaks.peaks[b];
      const a = Math.min(1, m * gain);
      const h = Math.max(1, a * (height - 2));
      ctx.fillRect(col, mid - h / 2, 1, h);
    }
  }, [peaks, cw, width, height, pps, mediaStart, rate, volume, muted, color]);
  return <canvas ref={ref} className="pointer-events-none absolute bottom-0 left-0" style={{ width, height }} />;
}

/** Dark ramps over the faded head / tail of an audio clip. */
function FadeRamps({ width, height, fadeIn, fadeOut }: { width: number; height: number; fadeIn: number; fadeOut: number }) {
  if (fadeIn <= 0 && fadeOut <= 0) return null;
  const fi = Math.min(width, fadeIn);
  const fo = Math.min(width, fadeOut);
  return (
    <svg className="pointer-events-none absolute bottom-0 left-0" width={width} height={height}>
      {fi > 0 && (
        <>
          <polygon points={`0,0 ${fi},0 0,${height}`} fill="rgba(0,0,0,0.45)" />
          <line x1={0} y1={height} x2={fi} y2={0} stroke="rgba(245,242,235,0.8)" strokeWidth={1} />
        </>
      )}
      {fo > 0 && (
        <>
          <polygon points={`${width},0 ${width - fo},0 ${width},${height}`} fill="rgba(0,0,0,0.45)" />
          <line x1={width} y1={height} x2={width - fo} y2={0} stroke="rgba(245,242,235,0.8)" strokeWidth={1} />
        </>
      )}
    </svg>
  );
}

export interface ClipViewProps {
  clip: NleClip;
  pps: number;
  /** Lane height; the clip is inset by 3 px top and bottom. */
  laneH: number;
  selected: boolean;
  locked: boolean;
  /** Hidden track, or the original of a clip being dragged. */
  dim: boolean;
  trackMuted: boolean;
  blade: boolean;
}

export const ClipView = memo(function ClipView({ clip, pps, laneH, selected, locked, dim, trackMuted, blade }: ClipViewProps) {
  const left = clip.start * pps;
  const width = Math.max(2, clip.duration * pps);
  const h = laneH - 6;
  const st = KIND_STYLE[clip.kind];
  const isAudio = clip.kind === 'audio';
  const band = clip.kind === 'video' && clip.hasAudio;
  const bandH = band ? BAND_H : 0;
  const visualH = h - bandH;
  const audible = isAudio || band;
  const fx = clip.adjust.brightness !== 0 || clip.adjust.contrast !== 1 || clip.adjust.saturation !== 1 || clip.adjust.blur !== 0;
  const interactive = !locked && !blade;
  const tr = clip.transitionIn;
  const trW = tr ? Math.max(10, Math.min(width, tr.duration * pps)) : 0;
  const narrow = width < 46;

  return (
    <div
      data-hit="clip"
      data-id={clip.id}
      className={cn('group absolute select-none', blade ? 'cursor-crosshair' : locked ? 'cursor-default' : 'cursor-grab', dim && 'opacity-40', selected ? 'z-[3]' : 'z-[1]')}
      style={{ left, width, top: 3, height: h }}
      title={`${clip.name} · ${fmtShort(clip.duration)}${clip.rate !== 1 ? ` · ${clip.rate}×` : ''}`}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[4px] border" style={{ background: clip.kind === 'color' && clip.color ? clip.color : st.bg, borderColor: st.border }}>
        {/* visual body */}
        {clip.kind === 'video' && (
          <div className="absolute left-0 right-0 top-0 overflow-hidden opacity-90" style={{ height: visualH }}>
            <Filmstrip clip={clip} pps={pps} width={width} height={visualH} />
          </div>
        )}
        {clip.kind === 'image' && clip.src && (
          <div className="absolute inset-0 opacity-85" style={{ backgroundImage: cssUrl(clip.src), backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' }} />
        )}
        {clip.kind === 'text' && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 overflow-hidden px-1.5" style={{ top: LABEL_H }}>
            <Type size={11} className="shrink-0 text-purple" />
            <span className="truncate font-sans text-[11px] font-semibold" style={{ color: st.text }}>
              {clip.text?.content || clip.name}
            </span>
          </div>
        )}
        {/* audio */}
        {isAudio && <Waveform assetId={clip.assetId} mediaStart={clip.mediaStart} rate={clip.rate} pps={pps} width={width} height={h - LABEL_H + 2} volume={clip.volume} muted={clip.muted || trackMuted} color={st.wave} />}
        {band && (
          <div className="absolute bottom-0 left-0 right-0 border-t border-black/40 bg-black/35" style={{ height: bandH }}>
            <Waveform assetId={clip.assetId} mediaStart={clip.mediaStart} rate={clip.rate} pps={pps} width={width} height={bandH} volume={clip.volume} muted={clip.muted || trackMuted} color="rgba(94,234,212,0.9)" />
          </div>
        )}
        {audible && !clip.muted && <FadeRamps width={width} height={isAudio ? h : bandH} fadeIn={clip.fadeIn * pps} fadeOut={clip.fadeOut * pps} />}
        {/* label row */}
        {!narrow && (
          <div className="absolute inset-x-0 top-0 flex items-center gap-1 bg-gradient-to-b from-black/70 to-black/0 px-1.5 font-mono text-[9.5px] leading-none" style={{ height: LABEL_H, color: st.text }}>
            {tr && <span className="shrink-0" style={{ width: Math.min(trW, width / 2) - 4 }} />}
            <span className="min-w-0 truncate font-semibold text-paper">{clip.name}</span>
            <span className="shrink-0 text-[9px] opacity-80">{fmtShort(clip.duration)}</span>
            {clip.rate !== 1 && <span className="shrink-0 rounded-[3px] bg-amber/90 px-[3px] py-[1px] text-[8.5px] font-bold text-obsidian">{+clip.rate.toFixed(2)}×</span>}
            {clip.linkId && <Link2 size={10} className="shrink-0 text-paper/80" aria-label="Linked" />}
            {clip.muted && <VolumeX size={10} className="shrink-0 text-paper/70" aria-label="Muted" />}
            {(fx || clip.transformEnd) && (
              <span className="flex shrink-0 gap-[2px]" title={[fx && 'Colour adjust', clip.transformEnd && 'Animated transform'].filter(Boolean).join(' · ')}>
                {fx && <span className="h-[5px] w-[5px] rounded-full bg-purple" />}
                {clip.transformEnd && <span className="h-[5px] w-[5px] rounded-full bg-amber" />}
              </span>
            )}
          </div>
        )}
      </div>

      {/* selection outline */}
      <div
        className={cn('pointer-events-none absolute inset-0 rounded-[4px]', selected ? 'border-2 border-orange shadow-[0_0_0_1px_rgba(255,85,0,0.35),0_0_10px_rgba(255,85,0,0.35)]' : 'border border-transparent group-hover:border-paper/40')}
      />

      {/* trim handles */}
      {interactive && (
        <>
          <div data-hit="trim-start" data-id={clip.id} className={cn('absolute bottom-0 left-0 top-0 z-[2] w-[6px] cursor-ew-resize rounded-l-[4px] transition-opacity', selected ? 'bg-orange opacity-100' : 'bg-paper/70 opacity-0 group-hover:opacity-100')} />
          <div data-hit="trim-end" data-id={clip.id} className={cn('absolute bottom-0 right-0 top-0 z-[2] w-[6px] cursor-ew-resize rounded-r-[4px] transition-opacity', selected ? 'bg-orange opacity-100' : 'bg-paper/70 opacity-0 group-hover:opacity-100')} />
        </>
      )}

      {/* audio fade handles */}
      {interactive && audible && !clip.muted && width > 30 && (
        <>
          <div
            data-hit="fade-in"
            data-id={clip.id}
            title={`Fade in ${clip.fadeIn.toFixed(2)}s — drag`}
            className={cn('absolute z-[4] h-[9px] w-[9px] -translate-x-1/2 cursor-ew-resize rounded-full border border-obsidian bg-paper transition-opacity', selected || clip.fadeIn > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
            style={{ left: Math.max(9, Math.min(width / 2, clip.fadeIn * pps)), top: isAudio ? 2 : h - bandH - 4 }}
          />
          <div
            data-hit="fade-out"
            data-id={clip.id}
            title={`Fade out ${clip.fadeOut.toFixed(2)}s — drag`}
            className={cn('absolute z-[4] h-[9px] w-[9px] -translate-x-1/2 cursor-ew-resize rounded-full border border-obsidian bg-paper transition-opacity', selected || clip.fadeOut > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
            style={{ left: width - Math.max(9, Math.min(width / 2, clip.fadeOut * pps)), top: isAudio ? 2 : h - bandH - 4 }}
          />
        </>
      )}

      {/* transition badge: bow-tie spanning the transition, from the clip's left edge */}
      {tr && (
        <div data-hit="tr-body" data-id={clip.id} className="absolute left-0 z-[5] cursor-pointer" style={{ width: trW, height: 16, top: Math.max(0, visualH / 2 - 8) }} title={`${tr.type} · ${tr.duration.toFixed(2)}s — drag the right edge to change`}>
          <svg width={trW} height={16} className="pointer-events-none block">
            <rect x={0.5} y={0.5} width={trW - 1} height={15} rx={3} fill="rgba(10,10,10,0.75)" stroke={ORANGE} strokeWidth={1} />
            <polygon points={`2,2 ${trW / 2},8 2,14`} fill={ORANGE} opacity={0.9} />
            <polygon points={`${trW - 2},2 ${trW / 2},8 ${trW - 2},14`} fill={ORANGE} opacity={0.9} />
          </svg>
          {!locked && <div data-hit="tr-edge" data-id={clip.id} className="absolute -right-[3px] top-0 h-full w-[7px] cursor-ew-resize" />}
        </div>
      )}
    </div>
  );
});
