// Shared /robo carousel slide layout (1080×1350 design units) + Canvas2D PNG exporter.
// The HTML SlideView and this canvas renderer use the same palette, sizes and positions.
import type { Slide } from './data';

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;
export const PAD = 96;

export interface SlidePalette {
  bg: string;
  fg: string;
  sub: string;
  accent: string;
  line: string;
  numeral: string;
  pillBg: string;
  pillFg: string;
  name: string;
}

const STANDARD: Record<Slide['theme'], SlidePalette> = {
  dark: { name: '/robo Ink Well', bg: '#0A0A0A', fg: '#F5F2EB', sub: '#A39E93', accent: '#FF5500', line: '#262522', numeral: '#FF5500', pillBg: '#FF5500', pillFg: '#0A0A0A' },
  paper: { name: '/robo Paper', bg: '#F5F2EB', fg: '#0A0A0A', sub: '#5A554C', accent: '#FF5500', line: '#D9D3C7', numeral: '#FF5500', pillBg: '#0A0A0A', pillFg: '#F5F2EB' },
};

const WILDCARD: SlidePalette[] = [
  { name: 'Wildcard · Signal Orange', bg: '#FF5500', fg: '#0A0A0A', sub: '#3A1504', accent: '#0A0A0A', line: 'rgba(10,10,10,0.22)', numeral: 'rgba(10,10,10,0.16)', pillBg: '#0A0A0A', pillFg: '#FF5500' },
  { name: 'Wildcard · Electric Blue', bg: '#1F2BFF', fg: '#F5F2EB', sub: '#C9CCFF', accent: '#C6FF00', line: 'rgba(245,242,235,0.25)', numeral: 'rgba(198,255,0,0.22)', pillBg: '#C6FF00', pillFg: '#0A0A0A' },
  { name: 'Wildcard · Acid Lime', bg: '#C6FF00', fg: '#0A0A0A', sub: '#2B3300', accent: '#6B00FF', line: 'rgba(10,10,10,0.2)', numeral: 'rgba(107,0,255,0.18)', pillBg: '#6B00FF', pillFg: '#F5F2EB' },
];

export function slidePalette(slide: Slide, index: number, wildcard: boolean): SlidePalette {
  return wildcard ? WILDCARD[index % WILDCARD.length] : STANDARD[slide.theme];
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function headlineSize(slide: Slide, wildcard: boolean): number {
  if (wildcard) return slide.kind === 'cover' ? 120 : 100;
  return slide.kind === 'cover' ? 132 : slide.kind === 'cta' ? 116 : slide.kind === 'stat' ? 90 : 100;
}

export const BODY_SIZE = 44;
export const BODY_LH = 1.42;
export const HEAD_LH = 1.04;
export const WILD_HEAD_LH = 0.98;

/** Big numeral shown on a slide (stat value, or index for point slides). */
export function slideNumeral(slide: Slide, index: number): string | null {
  if (slide.kind === 'stat') return slide.stat ?? pad2(index + 1);
  if (slide.kind === 'point') return pad2(index + 1);
  return null;
}

// ───────────────────────── canvas export ─────────────────────────

type Ctx = CanvasRenderingContext2D;
const MASCOT = ['00011000', '00111100', '11111111', '10100101', '11111111', '11000011', '01111110', '01011010'];

function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${w}` : w;
      if (!cur || ctx.measureText(next).width <= maxW) cur = next;
      else {
        out.push(cur);
        cur = w;
      }
    }
    out.push(cur);
  }
  return out;
}

function drawMascot(ctx: Ctx, x: number, y: number, size: number, color: string) {
  const px = size / 8;
  ctx.fillStyle = color;
  MASCOT.forEach((row, ry) => row.split('').forEach((c, rx) => c === '1' && ctx.fillRect(x + rx * px, y + ry * px, px, px)));
}

function fitNumeral(ctx: Ctx, text: string, maxSize: number, maxW: number): number {
  let size = maxSize;
  ctx.font = `800 ${size}px Doto, monospace`;
  while (ctx.measureText(text).width > maxW && size > 60) {
    size -= 10;
    ctx.font = `800 ${size}px Doto, monospace`;
  }
  return size;
}

export interface SlideDrawInput {
  slide: Slide; // with edits applied
  index: number;
  total: number;
  handle: string;
  wildcard: boolean;
}

export function drawSlide(ctx: Ctx, { slide, index, total, handle, wildcard }: SlideDrawInput) {
  const p = slidePalette(slide, index, wildcard);
  const last = index === total - 1;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
  const contentW = SLIDE_W - PAD * 2;

  if (!wildcard) {
    // subtle grid on dark
    if (slide.theme === 'dark') {
      ctx.strokeStyle = 'rgba(245,242,235,0.035)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= SLIDE_W; x += 60) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, SLIDE_H);
      }
      for (let y = 0; y <= SLIDE_H; y += 60) {
        ctx.moveTo(0, y);
        ctx.lineTo(SLIDE_W, y);
      }
      ctx.stroke();
      const g = ctx.createRadialGradient(SLIDE_W, 0, 0, SLIDE_W, 0, 900);
      g.addColorStop(0, 'rgba(255,85,0,0.16)');
      g.addColorStop(1, 'rgba(255,85,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
    }
    // header
    drawMascot(ctx, PAD, PAD - 4, 40, p.accent);
    ctx.font = '600 26px "JetBrains Mono", monospace';
    ctx.fillStyle = p.sub;
    ctx.fillText(handle, PAD + 60, PAD + 28);
    ctx.font = '800 44px Doto, monospace';
    ctx.fillStyle = p.accent;
    ctx.textAlign = 'right';
    ctx.fillText(`${pad2(index + 1)}/${pad2(total)}`, SLIDE_W - PAD, PAD + 34);
    ctx.textAlign = 'left';
    ctx.fillStyle = p.line;
    ctx.fillRect(PAD, 170, contentW, 2);

    // content flow
    let y = 232;
    const numeral = slideNumeral(slide, index);
    if (numeral) {
      const size = fitNumeral(ctx, numeral, slide.kind === 'stat' ? 230 : 180, contentW);
      ctx.fillStyle = p.numeral;
      ctx.fillText(numeral, PAD - 6, y + size * 0.82);
      y += size + 28;
    } else {
      y += 80;
    }
    ctx.font = '600 28px "JetBrains Mono", monospace';
    ctx.fillStyle = p.accent;
    ctx.fillText(slide.kicker.toUpperCase(), PAD, y + 26);
    y += 28 + 28;
    const hs = headlineSize(slide, false);
    ctx.font = `700 ${hs}px Outfit, sans-serif`;
    ctx.fillStyle = p.fg;
    for (const line of wrap(ctx, slide.headline, contentW)) {
      ctx.fillText(line, PAD, y + hs * 0.86);
      y += hs * HEAD_LH;
    }
    y += 36;
    ctx.font = `400 ${BODY_SIZE}px Outfit, sans-serif`;
    ctx.fillStyle = p.sub;
    for (const line of wrap(ctx, slide.body, 860)) {
      if (y > 1150) break;
      ctx.fillText(line, PAD, y + BODY_SIZE * 1.0);
      y += BODY_SIZE * BODY_LH;
    }

    // footer
    const segGap = 10;
    const segW = (contentW - segGap * (total - 1)) / total;
    for (let i = 0; i < total; i++) {
      ctx.fillStyle = i <= index ? p.accent : p.line;
      ctx.fillRect(PAD + i * (segW + segGap), 1196, segW, 8);
    }
    ctx.font = '600 24px "JetBrains Mono", monospace';
    ctx.fillStyle = p.sub;
    ctx.fillText('VOLTA · /robo', PAD, 1262);
    ctx.font = '600 28px "JetBrains Mono", monospace';
    ctx.fillStyle = p.accent;
    ctx.textAlign = 'right';
    ctx.fillText(last ? 'SAVE + SHARE ↺' : 'SWIPE →', SLIDE_W - PAD, 1262);
    ctx.textAlign = 'left';
  } else {
    // WILDCARD poster layout
    const numeral = slide.stat ?? pad2(index + 1);
    const size = fitNumeral(ctx, numeral, 560, SLIDE_W - 120);
    ctx.fillStyle = p.numeral;
    ctx.fillText(numeral, 60, 40 + size * 0.84);
    ctx.font = '600 30px "JetBrains Mono", monospace';
    ctx.fillStyle = p.fg;
    ctx.textAlign = 'right';
    ctx.fillText(`${pad2(index + 1)} — ${pad2(total)}`, SLIDE_W - PAD, PAD + 20);
    ctx.textAlign = 'left';

    // measure bottom-anchored block
    const hs = headlineSize(slide, true);
    ctx.font = `700 ${hs}px Outfit, sans-serif`;
    const hLines = wrap(ctx, slide.headline.toUpperCase(), contentW);
    ctx.font = `400 38px Outfit, sans-serif`;
    const bLines = wrap(ctx, slide.body, contentW);
    const pillH = 52;
    const blockH = pillH + 32 + hLines.length * hs * WILD_HEAD_LH + 32 + bLines.length * 38 * 1.4;
    let y = SLIDE_H - 230 - blockH;

    ctx.font = '600 26px "JetBrains Mono", monospace';
    const kick = slide.kicker.toUpperCase();
    const kw = ctx.measureText(kick).width + 40;
    ctx.fillStyle = p.pillBg;
    ctx.beginPath();
    ctx.roundRect(PAD, y, kw, pillH, pillH / 2);
    ctx.fill();
    ctx.fillStyle = p.pillFg;
    ctx.fillText(kick, PAD + 20, y + 35);
    y += pillH + 32;
    ctx.font = `700 ${hs}px Outfit, sans-serif`;
    ctx.fillStyle = p.fg;
    for (const line of hLines) {
      ctx.fillText(line, PAD, y + hs * 0.84);
      y += hs * WILD_HEAD_LH;
    }
    y += 32;
    ctx.font = `400 38px Outfit, sans-serif`;
    ctx.fillStyle = p.sub;
    for (const line of bLines) {
      ctx.fillText(line, PAD, y + 38);
      y += 38 * 1.4;
    }
    ctx.fillStyle = p.line;
    ctx.fillRect(PAD, 1180, contentW, 2);
    ctx.font = '700 44px Outfit, sans-serif';
    ctx.fillStyle = p.fg;
    ctx.fillText(last ? 'SAVE THIS ↺' : 'SWIPE ⟶', PAD, 1262);
    ctx.font = '600 24px "JetBrains Mono", monospace';
    ctx.fillStyle = p.sub;
    ctx.textAlign = 'right';
    ctx.fillText(handle, SLIDE_W - PAD, 1258);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

export async function ensureSlideFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('700 100px Outfit'),
      document.fonts.load('400 40px Outfit'),
      document.fonts.load('800 100px Doto'),
      document.fonts.load('600 28px "JetBrains Mono"'),
    ]);
  } catch {
    // fall back to system fonts
  }
}

/** Render one slide to a 1080×1350 PNG blob. */
export async function slideToBlob(input: SlideDrawInput): Promise<Blob> {
  await ensureSlideFonts();
  const canvas = document.createElement('canvas');
  canvas.width = SLIDE_W;
  canvas.height = SLIDE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  drawSlide(ctx, input);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}
