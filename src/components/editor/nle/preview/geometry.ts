// VOLTA Editor — Edit mode preview: display-space geometry of a layer (pure; mirrors src/lib/nle/model.ts exactly).
// Every model fraction maps to px through the displayed frame size (fw × fh); k = fw / seq.width.
import type { Layer, TransitionFx } from '@/lib/nle/model';
import { cssFilter, fittedSize, textAnimAt, transformAt, transitionFx } from '@/lib/nle/model';
import type { NleClip, NleSequence, NleTransform } from '@/types/nle';

export interface LayerGeom {
  clip: NleClip;
  outgoing: boolean;
  /** Centre in frame px. */
  cx: number;
  cy: number;
  /** Base (pre-scale) box in display px; null for text (auto-sized, measured from the DOM). */
  w: number | null;
  h: number | null;
  /** Total scale: transform × transition × text anim. */
  s: number;
  rot: number;
  opacity: number;
  filter: string;
  reveal: [number, number] | null;
  wash: TransitionFx['wash'];
  /** Typewriter: visible character count (null = all). */
  chars: number | null;
  tf: NleTransform;
}

export function layerGeom(layer: Layer, seq: Pick<NleSequence, 'width' | 'height'>, t: number, fw: number, fh: number): LayerGeom {
  const c = layer.clip;
  const k = fw / Math.max(1, seq.width);
  const tf = transformAt(c, t);
  const fx = transitionFx(layer);
  const ta = c.kind === 'text' ? textAnimAt(c, t) : { opacity: 1, dy: 0, scale: 1, chars: null };
  let w: number | null = null;
  let h: number | null = null;
  if (c.kind !== 'text') {
    const f = fittedSize(c, seq.width, seq.height);
    w = f.w * k;
    h = f.h * k;
  }
  return {
    clip: c,
    outgoing: layer.outgoing,
    cx: fw / 2 + (tf.x + fx.dx) * fw,
    cy: fh / 2 + (tf.y + fx.dy + ta.dy) * fh,
    w,
    h,
    s: tf.scale * fx.scale * ta.scale,
    rot: tf.rotation,
    opacity: Math.max(0, Math.min(1, tf.opacity * fx.opacity * ta.opacity)),
    filter: cssFilter(c.adjust, k),
    reveal: fx.reveal,
    wash: fx.wash,
    chars: ta.chars,
    tf,
  };
}

/** CSS transform placing an element's centre at (cx, cy) with rotation and scale about its centre. */
export function placeTransform(g: Pick<LayerGeom, 'cx' | 'cy' | 'rot' | 's'>, withScale = true): string {
  return `translate(${g.cx.toFixed(2)}px, ${g.cy.toFixed(2)}px) translate(-50%, -50%) rotate(${g.rot.toFixed(3)}deg)${withScale ? ` scale(${g.s.toFixed(4)})` : ''}`;
}

/** Is frame point (px, py) inside the layer's rotated, scaled rectangle (base size w × h)? */
export function hitsBox(g: Pick<LayerGeom, 'cx' | 'cy' | 'rot' | 's'>, w: number, h: number, px: number, py: number, slop = 0): boolean {
  const dx = px - g.cx;
  const dy = py - g.cy;
  const a = (-g.rot * Math.PI) / 180;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  const hw = (Math.abs(w * g.s) / 2) + slop;
  const hh = (Math.abs(h * g.s) / 2) + slop;
  return Math.abs(lx) <= hw && Math.abs(ly) <= hh;
}
