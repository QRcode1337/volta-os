// VOLTA Editor — Edit mode timeline: layout constants, clip colours, ruler step math.
import type { NleClip, NleClipKind, NleTrackKind } from '@/types/nle';

export const HEADER_W = 150;
export const RULER_H = 28;
/** Drop zone above the top video track ("new video track"). */
export const TOP_ZONE = 22;
/** Space below the last audio track ("new audio track"); the lanes area grows to fill the view below it. */
export const BOTTOM_ZONE = 56;
export const VIDEO_H = 64;
export const AUDIO_H = 48;
/** Empty seconds after the sequence end so there is always room to drop after it. */
export const TAIL_SEC = 30;
export const MIN_PPS = 2;
export const MAX_PPS = 600;
export const DRAG_THRESHOLD = 3;

export const trackHeight = (k: NleTrackKind) => (k === 'video' ? VIDEO_H : AUDIO_H);
export const trackKindFor = (c: Pick<NleClip, 'kind'>): NleTrackKind => (c.kind === 'audio' ? 'audio' : 'video');

export interface KindStyle {
  bg: string;
  border: string;
  text: string;
  wave: string;
}

export const KIND_STYLE: Record<NleClipKind, KindStyle> = {
  video: { bg: 'rgba(20,184,166,0.16)', border: 'rgba(20,184,166,0.6)', text: '#99F6E4', wave: 'rgba(94,234,212,0.85)' },
  image: { bg: 'rgba(245,166,35,0.16)', border: 'rgba(245,166,35,0.6)', text: '#FDE68A', wave: 'rgba(253,230,138,0.8)' },
  audio: { bg: 'rgba(34,197,94,0.13)', border: 'rgba(34,197,94,0.55)', text: '#BBF7D0', wave: 'rgba(134,239,172,0.9)' },
  text: { bg: 'rgba(168,85,247,0.2)', border: 'rgba(168,85,247,0.65)', text: '#E9D5FF', wave: 'rgba(233,213,255,0.8)' },
  color: { bg: 'rgba(163,158,147,0.14)', border: 'rgba(163,158,147,0.5)', text: '#E7E5E0', wave: 'rgba(231,229,224,0.8)' },
};

export const ORANGE = '#FF5500';
export const SNAP_YELLOW = '#FACC15';

/** hh:mm:ss / mm:ss for ruler labels at ≥ 1 s steps. */
export function hms(t: number): string {
  const s = Math.round(t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

/** Major ruler step (seconds) with an integer subdivision, adaptive to zoom: majors are ≥ 72 px apart. */
export function pickSteps(pps: number, fps: number): { major: number; sub: number } {
  const f = 1 / Math.max(1, fps);
  const cands: [number, number][] = [
    [f, 1],
    [2 * f, 2],
    [5 * f, 5],
    [10 * f, 5],
    [1, 5],
    [2, 4],
    [5, 5],
    [10, 5],
    [15, 3],
    [30, 6],
    [60, 6],
    [120, 4],
    [300, 5],
    [600, 5],
    [900, 3],
    [1800, 6],
    [3600, 6],
  ];
  for (const [major, sub] of cands) if (major * pps >= 72) return { major, sub };
  return { major: 7200, sub: 4 };
}
