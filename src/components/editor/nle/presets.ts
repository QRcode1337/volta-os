// VOLTA Editor — Edit mode presets: text styles, transitions and colour solids offered by the asset panel, plus the
// helpers that turn a preset into a clip and pick an overlay track for it.
import type { NleClip, NleSequence, NleTransition, NleTransitionType } from '@/types/nle';
import { EPS, IDENTITY, DEFAULT_TEXT, baseClip, clipEnd, mainTrackId } from '@/lib/nle/model';
import type { DndPreset } from './dnd';
import type { NewTrackTarget } from './state';

export type TextPreset = Extract<DndPreset, { kind: 'text' }>;
export type TransitionPreset = Extract<DndPreset, { kind: 'transition' }>;
export type ColorPreset = Extract<DndPreset, { kind: 'color' }>;

export const TEXT_PRESETS: TextPreset[] = [
  { kind: 'text', label: 'Title', duration: 3, style: { content: 'Title', size: 128, weight: 800, animIn: 'fade', animOut: 'fade' } },
  { kind: 'text', label: 'Subtitle', duration: 3, style: { content: 'Subtitle goes here', size: 64, weight: 600, color: '#F5F2EB', animIn: 'slide-up', animOut: 'fade' }, transform: { y: 0.12 } },
  {
    kind: 'text',
    label: 'Lower third',
    duration: 4,
    style: { content: 'Name Surname', size: 52, weight: 600, align: 'left', background: '#0A0A0ACC', animIn: 'slide-up', animOut: 'fade' },
    transform: { x: -0.27, y: 0.33 },
  },
  { kind: 'text', label: 'Caption', duration: 3, style: { content: 'This is a caption', size: 46, weight: 600, background: '#000000B3', animIn: 'none', animOut: 'none' }, transform: { y: 0.38 } },
  { kind: 'text', label: 'Big bold', duration: 2, style: { content: 'BIG', font: 'Impact', size: 220, weight: 800, letterSpacing: 2, animIn: 'pop', animOut: 'fade' } },
  { kind: 'text', label: 'Outline', duration: 3, style: { content: 'OUTLINE', size: 140, weight: 800, color: '#FFFFFF', stroke: '#000000', strokeWidth: 8, animIn: 'pop', animOut: 'fade' } },
  { kind: 'text', label: 'Neon', duration: 3, style: { content: 'Neon nights', font: 'Avenir', size: 110, weight: 600, color: '#7CFFEA', stroke: '#14B8A6', strokeWidth: 3, letterSpacing: 4, animIn: 'fade', animOut: 'fade' } },
  { kind: 'text', label: 'Typewriter', duration: 4, style: { content: 'Typing it out…', font: 'Mono', size: 64, weight: 400, animIn: 'typewriter', animOut: 'fade' } },
  { kind: 'text', label: 'Quote', duration: 4, style: { content: '“A line worth quoting.”', font: 'Georgia', size: 76, weight: 400, italic: true, animIn: 'fade', animOut: 'fade' } },
  { kind: 'text', label: 'Label box', duration: 3, style: { content: 'LABEL', size: 42, weight: 800, color: '#0A0A0A', background: '#FF5500', letterSpacing: 3, animIn: 'pop', animOut: 'fade' }, transform: { x: -0.3, y: -0.32 } },
];

export const TRANSITION_LABELS: Record<NleTransitionType, string> = {
  dissolve: 'Cross dissolve',
  'dip-black': 'Dip to black',
  'dip-white': 'Dip to white',
  'slide-left': 'Slide left',
  'slide-right': 'Slide right',
  'slide-up': 'Slide up',
  'slide-down': 'Slide down',
  'zoom-in': 'Zoom in',
  'wipe-left': 'Wipe left',
  'wipe-right': 'Wipe right',
};

export const TRANSITION_PRESETS: TransitionPreset[] = (Object.keys(TRANSITION_LABELS) as NleTransitionType[]).map((type) => ({ kind: 'transition', type, label: TRANSITION_LABELS[type], duration: 0.5 }));

export const COLOR_PRESETS: ColorPreset[] = [
  { kind: 'color', label: 'Black', color: '#000000', duration: 5 },
  { kind: 'color', label: 'White', color: '#FFFFFF', duration: 5 },
  { kind: 'color', label: 'VOLTA orange', color: '#FF5500', duration: 5 },
  { kind: 'color', label: 'Ink', color: '#141413', duration: 5 },
  { kind: 'color', label: 'Slate', color: '#334155', duration: 5 },
  { kind: 'color', label: 'Teal', color: '#14B8A6', duration: 5 },
  { kind: 'color', label: 'Amber', color: '#F5A623', duration: 5 },
  { kind: 'color', label: 'Paper', color: '#F5F2EB', duration: 5 },
  { kind: 'color', label: 'Red', color: '#EF4444', duration: 5 },
  { kind: 'color', label: 'Blue', color: '#3B82F6', duration: 5 },
  { kind: 'color', label: 'Purple', color: '#A855F7', duration: 5 },
  { kind: 'color', label: 'Green', color: '#22C55E', duration: 5 },
];

/** A text / colour preset as a fresh clip (start 0, no track: ADD_CLIPS places it). Transitions are not clips: null. */
export function presetToClip(p: TextPreset | ColorPreset): NleClip;
export function presetToClip(p: DndPreset): NleClip | null;
export function presetToClip(p: DndPreset): NleClip | null {
  if (p.kind === 'text') {
    const text = { ...DEFAULT_TEXT, ...p.style };
    const name = text.content.split('\n')[0].trim().slice(0, 40) || p.label;
    return baseClip('text', { name, duration: p.duration, text, transform: { ...IDENTITY, ...p.transform } });
  }
  if (p.kind === 'color') return baseClip('color', { name: p.label, color: p.color, duration: p.duration });
  return null;
}

/** The transition a transition preset applies (SET_TRANSITION payload). */
export function presetToTransition(p: TransitionPreset): NleTransition {
  return { type: p.type, duration: p.duration };
}

/**
 * Track for an overlay (text / sticker) over [start, start + dur]: the lowest unlocked non-main video track that is
 * free there, else a new video track on top.
 */
export function overlayTrackFor(seq: Pick<NleSequence, 'tracks' | 'clips'>, start: number, dur: number): string | NewTrackTarget {
  const main = mainTrackId(seq);
  const end = start + dur;
  for (let i = seq.tracks.length - 1; i >= 0; i--) {
    const t = seq.tracks[i];
    if (t.kind !== 'video' || t.id === main || t.locked) continue;
    const busy = seq.clips.some((c) => c.trackId === t.id && c.start < end - EPS && clipEnd(c) > start + EPS);
    if (!busy) return t.id;
  }
  return { newTrack: 'video', position: 'top' };
}
