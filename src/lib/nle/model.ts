// VOLTA Editor — Edit mode: pure timing / layout math shared by the browser preview and the server ffmpeg export.
// No DOM, no Node APIs: importable from both sides. Semantics here are the contract the export must reproduce.
import type { NleAdjust, NleClip, NleSequence, NleTextStyle, NleTrack, NleTransform } from '@/types/nle';

export const EPS = 1e-4;
export const MIN_CLIP = 0.05;
export const TEXT_ANIM_SEC = 0.4;
export const DEFAULT_STILL_SEC = 5;
export const DEFAULT_TEXT_SEC = 3;

export const IDENTITY: NleTransform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
export const NEUTRAL_ADJUST: NleAdjust = { brightness: 0, contrast: 1, saturation: 1, blur: 0 };

export const DEFAULT_TEXT: NleTextStyle = {
  content: 'Your text',
  font: 'Inter',
  size: 96,
  color: '#FFFFFF',
  weight: 800,
  italic: false,
  align: 'center',
  stroke: null,
  strokeWidth: 0,
  background: null,
  letterSpacing: 0,
  animIn: 'fade',
  animOut: 'fade',
};

export const FORMATS = [
  { id: '16:9', label: '16:9 Landscape', width: 1920, height: 1080 },
  { id: '9:16', label: '9:16 Vertical', width: 1080, height: 1920 },
  { id: '1:1', label: '1:1 Square', width: 1080, height: 1080 },
  { id: '4:5', label: '4:5 Portrait', width: 1080, height: 1350 },
  { id: '21:9', label: '21:9 Cinema', width: 2560, height: 1080 },
] as const;

let seq = 0;
/** Short unique id with a prefix ("c_…" clip, "t_…" track, "m_…" marker, "l_…" link). */
export function uid(prefix: string): string {
  seq = (seq + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${seq.toString(36)}`;
}

export const clipEnd = (c: Pick<NleClip, 'start' | 'duration'>) => c.start + c.duration;
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const frameSnap = (t: number, fps: number) => Math.round(t * fps) / fps;

export function sequenceDuration(s: Pick<NleSequence, 'clips'>): number {
  return s.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
}

/** The main (magnetic) track: the last video track in display order. */
export function mainTrackId(s: Pick<NleSequence, 'tracks'>): string | null {
  for (let i = s.tracks.length - 1; i >= 0; i--) if (s.tracks[i].kind === 'video') return s.tracks[i].id;
  return null;
}

export const trackOf = (s: Pick<NleSequence, 'tracks'>, id: string): NleTrack | undefined => s.tracks.find((t) => t.id === id);
export const isVisualKind = (k: NleClip['kind']) => k !== 'audio';

/** Source seconds shown at sequence time `t` (may run past the clip end for transition handles; clamped to the source). */
export function sourceTime(c: NleClip, t: number): number {
  const raw = c.mediaStart + (t - c.start) * c.rate;
  const max = c.sourceDuration ?? Infinity;
  return clamp(raw, 0, Math.max(0, max - 1 / 60));
}

/** Longest the clip may run from its current mediaStart at its rate. */
export function maxDuration(c: Pick<NleClip, 'sourceDuration' | 'mediaStart' | 'rate'>): number {
  return c.sourceDuration == null ? Infinity : Math.max(MIN_CLIP, (c.sourceDuration - c.mediaStart) / c.rate);
}

/** Clips on a track sorted by start. */
export function trackClips(s: Pick<NleSequence, 'clips'>, trackId: string): NleClip[] {
  return s.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
}

/** The clip ending exactly where `c` starts on the same track (within half a frame): the outgoing side of c's transition. */
export function previousAdjacent(s: Pick<NleSequence, 'clips' | 'fps'>, c: NleClip): NleClip | null {
  const tol = 0.5 / (s.fps || 30);
  let best: NleClip | null = null;
  for (const o of s.clips) if (o.trackId === c.trackId && o.id !== c.id && Math.abs(clipEnd(o) - c.start) <= tol) best = o;
  return best;
}

/** Transform at sequence time t (linear from `transform` to `transformEnd` across the clip). */
export function transformAt(c: NleClip, t: number): NleTransform {
  if (!c.transformEnd) return c.transform;
  const p = clamp((t - c.start) / Math.max(EPS, c.duration), 0, 1);
  const a = c.transform;
  const b = c.transformEnd;
  return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), scale: lerp(a.scale, b.scale, p), rotation: lerp(a.rotation, b.rotation, p), opacity: lerp(a.opacity, b.opacity, p) };
}

/** Audio gain (0..2) at sequence time t: volume × fade envelope (0 when muted). */
export function gainAt(c: NleClip, t: number): number {
  if (c.muted) return 0;
  const local = t - c.start;
  let g = c.volume;
  if (c.fadeIn > 0) g *= clamp(local / c.fadeIn, 0, 1);
  if (c.fadeOut > 0) g *= clamp((c.duration - local) / c.fadeOut, 0, 1);
  return g;
}

/**
 * Transition state of a visual clip at time t: progress p in [0,1) while its transitionIn runs, else null.
 * While p is set, the previous adjacent clip (if any) is still drawn under it, held past its end.
 */
export function transitionAt(c: NleClip, t: number): { p: number } | null {
  const tr = c.transitionIn;
  if (!tr || tr.duration <= 0) return null;
  const local = t - c.start;
  if (local < 0 || local >= tr.duration) return null;
  return { p: local / tr.duration };
}

/**
 * Visual layers to draw at time t, bottom first. A layer is a clip plus whether it is a held "outgoing" layer under a
 * transition. Hidden tracks are skipped; audio clips are not layers.
 */
export interface Layer {
  clip: NleClip;
  /** Held under the incoming clip's transition (drawn past its own end). */
  outgoing: boolean;
  /** Progress of the incoming clip's transition for this pair, 0..1 (only on the incoming clip and its outgoing partner). */
  p: number | null;
  /** The transition driving this layer pair. */
  transition: NleClip['transitionIn'];
}

export function layersAt(s: NleSequence, t: number): Layer[] {
  const out: Layer[] = [];
  const videoTracks = s.tracks.filter((tr) => tr.kind === 'video' && !tr.hidden);
  // tracks[] is top→bottom; draw bottom first
  for (let i = videoTracks.length - 1; i >= 0; i--) {
    const tr = videoTracks[i];
    const onTrack = trackClips(s, tr.id);
    for (const c of onTrack) {
      if (t >= c.start - EPS && t < clipEnd(c) - EPS) {
        const x = transitionAt(c, t);
        if (x) {
          const prev = previousAdjacent(s, c);
          if (prev) out.push({ clip: prev, outgoing: true, p: x.p, transition: c.transitionIn });
          out.push({ clip: c, outgoing: false, p: x.p, transition: c.transitionIn });
        } else out.push({ clip: c, outgoing: false, p: null, transition: null });
      }
    }
  }
  return out;
}

/**
 * Per-layer visual modifiers produced by a transition at progress p (applied on top of the clip's own transform).
 * dx / dy are fractions of frame size; clipRect is an inset in fractions (left,right) for wipes; dim is a colour wash.
 */
export interface TransitionFx {
  opacity: number;
  dx: number;
  dy: number;
  scale: number;
  /** Visible horizontal range as fractions [from, to] of the frame width (wipes), null = full. */
  reveal: [number, number] | null;
  /** Overlay a solid colour with this alpha (dips). */
  wash: { color: string; alpha: number } | null;
}

const NO_FX: TransitionFx = { opacity: 1, dx: 0, dy: 0, scale: 1, reveal: null, wash: null };

export function transitionFx(layer: Layer): TransitionFx {
  if (layer.p == null || !layer.transition) return NO_FX;
  const p = layer.p;
  const e = p * p * (3 - 2 * p); // smoothstep
  const inc = !layer.outgoing;
  switch (layer.transition.type) {
    case 'dissolve':
      return { ...NO_FX, opacity: inc ? e : 1 };
    case 'dip-black':
    case 'dip-white': {
      const color = layer.transition.type === 'dip-black' ? '#000000' : '#FFFFFF';
      // first half: outgoing washes to colour; second half: incoming emerges from colour
      if (inc) return p < 0.5 ? { ...NO_FX, opacity: 0 } : { ...NO_FX, wash: { color, alpha: 1 - (p - 0.5) * 2 } };
      return p < 0.5 ? { ...NO_FX, wash: { color, alpha: p * 2 } } : { ...NO_FX, opacity: 0 };
    }
    case 'slide-left':
      return inc ? { ...NO_FX, dx: 1 - e } : { ...NO_FX, dx: -e };
    case 'slide-right':
      return inc ? { ...NO_FX, dx: -(1 - e) } : { ...NO_FX, dx: e };
    case 'slide-up':
      return inc ? { ...NO_FX, dy: 1 - e } : { ...NO_FX, dy: -e };
    case 'slide-down':
      return inc ? { ...NO_FX, dy: -(1 - e) } : { ...NO_FX, dy: e };
    case 'zoom-in':
      return inc ? { ...NO_FX, opacity: e, scale: 0.6 + 0.4 * e } : { ...NO_FX, scale: 1 + 0.25 * e };
    case 'wipe-left':
      return inc ? { ...NO_FX, reveal: [1 - e, 1] } : NO_FX;
    case 'wipe-right':
      return inc ? { ...NO_FX, reveal: [0, e] } : NO_FX;
    default:
      return NO_FX;
  }
}

/** Text animation at time t: opacity, y offset (fraction of frame height), scale, and visible character count (typewriter). */
export function textAnimAt(c: NleClip, t: number): { opacity: number; dy: number; scale: number; chars: number | null } {
  const text = c.text;
  if (!text) return { opacity: 1, dy: 0, scale: 1, chars: null };
  const local = t - c.start;
  const d = Math.min(TEXT_ANIM_SEC, c.duration / 3);
  let opacity = 1;
  let dy = 0;
  let scale = 1;
  let chars: number | null = null;
  const pin = clamp(local / d, 0, 1);
  const pout = clamp((c.duration - local) / d, 0, 1);
  const apply = (anim: NleTextStyle['animIn'], p: number, entering: boolean) => {
    const e = 1 - (1 - p) * (1 - p);
    switch (anim) {
      case 'fade':
        opacity *= e;
        break;
      case 'pop':
        opacity *= e;
        scale *= 0.6 + 0.4 * (p < 1 ? 1 - Math.pow(1 - p, 3) * Math.cos(p * Math.PI * 1.5) : 1);
        break;
      case 'slide-up':
        opacity *= e;
        dy += (entering ? 1 : -1) * 0.06 * (1 - e);
        break;
      case 'typewriter':
        if (entering) chars = Math.floor(text.content.length * clamp(local / Math.max(d, Math.min(c.duration * 0.6, text.content.length * 0.05)), 0, 1));
        else opacity *= e;
        break;
      default:
        break;
    }
  };
  apply(text.animIn, pin, true);
  apply(text.animOut, pout, false);
  return { opacity, dy, scale, chars };
}

/** Fitted media box (px at sequence resolution) before the clip transform: contain / cover / fill. */
export function fittedSize(c: Pick<NleClip, 'width' | 'height' | 'fit'>, W: number, H: number): { w: number; h: number } {
  if (!c.width || !c.height || c.fit === 'fill') return { w: W, h: H };
  const r = c.width / c.height;
  const frameR = W / H;
  const containW = r > frameR ? W : H * r;
  const coverW = r > frameR ? H * r : W;
  const w = c.fit === 'cover' ? coverW : containW;
  return { w, h: w / r };
}

export function fmtTC(t: number, fps: number): string {
  const f = Math.max(1, Math.round(fps));
  const total = Math.max(0, Math.round(t * f));
  const fr = total % f;
  const s = Math.floor(total / f);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${hh ? `${p(hh)}:` : ''}${p(mm)}:${p(ss)}:${p(fr)}`;
}

export function fmtShort(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m ? `${m}:${s.toFixed(1).padStart(4, '0')}` : `${s.toFixed(1)}s`;
}

export function newSequence(name = 'Untitled edit', format: (typeof FORMATS)[number] = FORMATS[0]): NleSequence {
  return {
    v: 1,
    id: uid('seq'),
    name,
    width: format.width,
    height: format.height,
    fps: 30,
    background: '#000000',
    tracks: [
      { id: uid('t'), kind: 'video', name: 'V2', muted: false, hidden: false, locked: false },
      { id: uid('t'), kind: 'video', name: 'V1', muted: false, hidden: false, locked: false },
      { id: uid('t'), kind: 'audio', name: 'A1', muted: false, hidden: false, locked: false },
      { id: uid('t'), kind: 'audio', name: 'A2', muted: false, hidden: false, locked: false },
    ],
    clips: [],
    markers: [],
    updatedAt: new Date().toISOString(),
  };
}

/** Base clip with every field defaulted; callers override what they know. */
export function baseClip(kind: NleClip['kind'], over: Partial<NleClip> = {}): NleClip {
  return {
    id: uid('c'),
    trackId: '',
    kind,
    name: kind,
    assetId: null,
    src: null,
    start: 0,
    duration: kind === 'text' ? DEFAULT_TEXT_SEC : DEFAULT_STILL_SEC,
    mediaStart: 0,
    rate: 1,
    sourceDuration: null,
    width: null,
    height: null,
    hasAudio: false,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    fit: 'contain',
    transform: { ...IDENTITY },
    transformEnd: null,
    adjust: { ...NEUTRAL_ADJUST },
    text: kind === 'text' ? { ...DEFAULT_TEXT } : null,
    color: kind === 'color' ? '#111111' : null,
    transitionIn: null,
    linkId: null,
    ...over,
  };
}

/** Clip template for a media asset (bin item or upload). Duration = whole source (stills: 5 s). */
export function clipFromAsset(a: { id: string; url: string; name: string; media: 'video' | 'audio' | 'image'; durationSec: number | null; width: number | null; height: number | null; hasAudio: boolean }): NleClip {
  const dur = a.media === 'image' ? DEFAULT_STILL_SEC : Math.max(MIN_CLIP, a.durationSec ?? DEFAULT_STILL_SEC);
  return baseClip(a.media, {
    name: a.name.replace(/\.[^.]+$/, '') || a.name,
    assetId: a.id,
    src: a.url,
    duration: dur,
    sourceDuration: a.media === 'image' ? null : a.durationSec,
    width: a.width,
    height: a.height,
    hasAudio: a.media === 'audio' || (a.media === 'video' && a.hasAudio),
  });
}

/** CSS filter string for an adjust block (preview). Export maps the same numbers onto ffmpeg eq / boxblur. */
export function cssFilter(a: NleAdjust, scalePx = 1): string {
  const parts: string[] = [];
  if (a.brightness) parts.push(`brightness(${(1 + a.brightness).toFixed(3)})`);
  if (a.contrast !== 1) parts.push(`contrast(${a.contrast.toFixed(3)})`);
  if (a.saturation !== 1) parts.push(`saturate(${a.saturation.toFixed(3)})`);
  if (a.blur) parts.push(`blur(${(a.blur * scalePx).toFixed(2)}px)`);
  return parts.join(' ') || 'none';
}

export const FONT_STACK: Record<NleTextStyle['font'], string> = {
  Inter: 'Inter, "SF Pro Display", system-ui, sans-serif',
  Helvetica: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  Avenir: '"Avenir Next", Avenir, sans-serif',
  Georgia: 'Georgia, "Times New Roman", serif',
  Impact: 'Impact, "Arial Black", sans-serif',
  Mono: '"SF Mono", Menlo, monospace',
};
