// Shared Canvas2D helpers for the procedural VOLTA scenes. Pure functions, no module-scope DOM access.

export const C = {
  bg: '#0A0A0A',
  panel: '#141413',
  elev: '#1C1B19',
  border: '#262522',
  hi: '#3A3834',
  paper: '#F5F2EB',
  sec: '#A39E93',
  muted: '#6E6A61',
  orange: '#FF5500',
  amber: '#F5A623',
  green: '#22C55E',
  purple: '#A855F7',
  teal: '#14B8A6',
  blue: '#3B82F6',
  red: '#EF4444',
  cyan: '#06B6D4',
} as const;

export interface SceneMeta {
  /** Optional heading override (inbox clips render their own title). */
  heading?: string;
}

export type SceneDraw = (ctx: CanvasRenderingContext2D, w: number, h: number, tSec: number, durationSec: number, meta?: SceneMeta) => void;

export interface SceneHotspot {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneDef {
  key: string;
  label: string;
  draw: SceneDraw;
  /** Labelled regions (percent of the 16:9 frame) used for the spatial descriptor in prompts. First match wins. */
  hotspots: SceneHotspot[];
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOutCubic = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp01(t)));
export const easeOutBack = (t: number) => {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/** Deterministic pseudo-noise in [0,1) from an integer index (no Math.random). */
export function noise(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${clamp01(a)})`;
}

type Family = 'sans' | 'doto' | 'mono';
const FAMILIES: Record<Family, string> = {
  sans: "Outfit, system-ui, -apple-system, sans-serif",
  doto: "Doto, 'JetBrains Mono', monospace",
  mono: "'JetBrains Mono', ui-monospace, monospace",
};

export function setFont(ctx: CanvasRenderingContext2D, size: number, weight: number | string = 600, family: Family = 'sans') {
  ctx.font = `${weight} ${Math.max(1, size).toFixed(1)}px ${FAMILIES[family]}`;
}

export function spacing(ctx: CanvasRenderingContext2D, px: number) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${px}px`;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, stroke: string = C.border, fill: string = C.panel) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

export function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  opts: { size: number; weight?: number | string; family?: Family; color?: string; align?: CanvasTextAlign; base?: CanvasTextBaseline; track?: number; alpha?: number },
) {
  ctx.save();
  setFont(ctx, opts.size, opts.weight ?? 600, opts.family ?? 'sans');
  spacing(ctx, opts.track ?? 0);
  ctx.globalAlpha *= opts.alpha ?? 1;
  ctx.fillStyle = opts.color ?? C.paper;
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = opts.base ?? 'alphabetic';
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** Dark backdrop: obsidian fill, faint radial glow, dotted grid, vignette. */
export function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, glow: { x: number; y: number; color?: string; strength?: number } = { x: 0.5, y: 0.5 }) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(glow.x * w, glow.y * h, 0, glow.x * w, glow.y * h, Math.max(w, h) * 0.6);
  const strength = (glow.strength ?? 0.16) * (0.85 + 0.15 * Math.sin(t * 0.8));
  g.addColorStop(0, hexA(glow.color ?? C.orange, strength));
  g.addColorStop(1, 'rgba(10,10,10,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // dotted grid
  const step = h / 22;
  const off = (t * step * 0.15) % step;
  ctx.fillStyle = 'rgba(245,242,235,0.055)';
  for (let y = off; y < h; y += step) {
    for (let x = 0; x < w; x += step) ctx.fillRect(x, y, 1.2, 1.2);
  }
  // vignette
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/** HUD chrome: corner brackets, scene label, blinking REC badge, scanline. */
export function drawHudChrome(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, label: string) {
  const u = h / 100;
  const m = 3.2 * u;
  const L = 4 * u;
  ctx.save();
  ctx.strokeStyle = 'rgba(245,242,235,0.28)';
  ctx.lineWidth = Math.max(1, u * 0.18);
  const corners: [number, number, number, number][] = [
    [m, m, 1, 1],
    [w - m, m, -1, 1],
    [m, h - m, 1, -1],
    [w - m, h - m, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x, y + sy * L);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * L, y);
    ctx.stroke();
  }
  text(ctx, label, m + 1.4 * u, m + 3.6 * u, { size: 1.9 * u, family: 'mono', color: C.sec, track: u * 0.25, weight: 600 });
  const on = Math.floor(t * 1.6) % 2 === 0;
  ctx.fillStyle = on ? C.orange : hexA(C.orange, 0.25);
  ctx.beginPath();
  ctx.arc(w - m - 9 * u, m + 2.9 * u, 0.8 * u, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, 'REC', w - m - 7.6 * u, m + 3.6 * u, { size: 1.9 * u, family: 'mono', color: C.sec, track: u * 0.2 });
  // moving scanline
  const sy = ((t * 0.12) % 1) * h;
  const sg = ctx.createLinearGradient(0, sy - 6 * u, 0, sy);
  sg.addColorStop(0, 'rgba(255,85,0,0)');
  sg.addColorStop(1, 'rgba(255,85,0,0.035)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, sy - 6 * u, w, 6 * u);
  ctx.restore();
}

/** 8×8 pixel mascot (same grid as PixelMascotLogo). `reveal` 0..1 assembles pixels. */
const MASCOT = ['00011000', '00111100', '11111111', '10100101', '11111111', '11000011', '01111110', '01011010'];
export function drawMascot(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, reveal = 1, color: string = C.orange) {
  const px = size / 8;
  let k = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (MASCOT[y][x] !== '1') continue;
      k++;
      const delay = noise(k * 3.1) * 0.6;
      const p = easeOutBack(seg(reveal, delay, delay + 0.4));
      if (p <= 0) continue;
      const fx = (noise(k * 7.7) - 0.5) * size * 3;
      const fy = (noise(k * 9.3) - 0.5) * size * 3;
      ctx.globalAlpha = clamp01(p);
      ctx.fillStyle = color;
      ctx.fillRect(cx - size / 2 + x * px + fx * (1 - p), cy - size / 2 + y * px + fy * (1 - p), px * 0.92, px * 0.92);
    }
  }
  ctx.globalAlpha = 1;
}

/** Count-up helper formatted with thousands separators. */
export function countUp(target: number, p: number, decimals = 0): string {
  const v = target * easeOutExpo(p);
  return decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('en-US');
}

/** Bottom-centre subtitle caption (drawn by the canvas host for procedural clips). */
export function drawCaption(ctx: CanvasRenderingContext2D, w: number, h: number, caption: string, alpha: number) {
  if (!caption || alpha <= 0) return;
  const u = h / 100;
  ctx.save();
  ctx.globalAlpha = clamp01(alpha);
  setFont(ctx, 3.1 * u, 500, 'sans');
  spacing(ctx, 0);
  const maxW = w * 0.7;
  let s = caption;
  while (ctx.measureText(s).width > maxW && s.length > 8) s = `${s.slice(0, -2)}`;
  if (s !== caption) s = `${s.trimEnd()}…`;
  const tw = ctx.measureText(s).width;
  const bx = w / 2 - tw / 2 - 2 * u;
  const by = h * 0.905 - 3.4 * u;
  roundRect(ctx, bx, by, tw + 4 * u, 5.2 * u, 1 * u);
  ctx.fillStyle = 'rgba(10,10,10,0.72)';
  ctx.fill();
  ctx.fillStyle = C.paper;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, w / 2, by + 2.65 * u);
  ctx.restore();
}
