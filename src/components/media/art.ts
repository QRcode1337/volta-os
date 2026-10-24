// Deterministic procedural "generation" renderer: seed + prompt → Canvas2D composition.
// STANDARD = /robo YouTube-thumbnail rules. WILDCARD = radically different palettes/layouts/textures.
// `t` (seconds) drives the looping animation for video-model items; t = 0 is the still frame.
import { seededRandom } from '@/lib/mock-data';
import { headlineFromPrompt, type GenItem } from './data';
import { accentWordIndex, pickBadge, pickSubject, pickWildcardStyle } from './style';

type Ctx = CanvasRenderingContext2D;
export type ArtInput = Pick<GenItem, 'prompt' | 'seed' | 'variant' | 'aspect' | 'mediaType'>;

const ORANGE = '#FF5500';
const PAPER = '#F5F2EB';
const OBSIDIAN = '#0A0A0A';
const TAU = Math.PI * 2;

const MASCOT = ['00011000', '00111100', '11111111', '10100101', '11111111', '11000011', '01111110', '01011010'];

// ───────────────────────── text helpers ─────────────────────────

export function wrapLines(ctx: Ctx, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Largest font size (step 2px) so the wrapped text fits maxW × maxH. */
export function fitText(
  ctx: Ctx,
  text: string,
  maxW: number,
  maxH: number,
  font: (size: number) => string,
  maxSize: number,
  lineHeight = 1.0,
  minSize = 10,
): { size: number; lines: string[] } {
  for (let size = maxSize; size >= minSize; size -= 2) {
    ctx.font = font(size);
    const lines = wrapLines(ctx, text, maxW);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (lines.length * size * lineHeight <= maxH && widest <= maxW) return { size, lines };
  }
  ctx.font = font(minSize);
  return { size: minSize, lines: wrapLines(ctx, text, maxW) };
}

const outfit = (weight: number) => (size: number) => `${weight} ${size}px Outfit, system-ui, sans-serif`;
const doto = (size: number) => `800 ${size}px Doto, ui-monospace, monospace`;
const mono = (size: number) => `600 ${size}px "JetBrains Mono", ui-monospace, monospace`;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ───────────────────────── entry point ─────────────────────────

export function drawGen(ctx: Ctx, w: number, h: number, item: ArtInput, t = 0) {
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.textBaseline = 'alphabetic';
  ctx.globalCompositeOperation = 'source-over';
  if (item.variant === 'wildcard') {
    const style = pickWildcardStyle(item.seed);
    const fn = { risograph: drawRiso, vaporwave: drawVapor, swiss: drawSwiss, acid: drawAcid, bauhaus: drawBauhaus }[style];
    fn(ctx, w, h, item, t);
  } else {
    drawStandard(ctx, w, h, item, t);
  }
  if (item.mediaType === 'animation' && t > 0) drawLoopBar(ctx, w, h, t, item.variant === 'wildcard');
  ctx.restore();
}

function drawLoopBar(ctx: Ctx, w: number, h: number, t: number, light: boolean) {
  const p = (t % 5) / 5;
  ctx.fillStyle = light ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, h - 4, w, 4);
  ctx.fillStyle = ORANGE;
  ctx.fillRect(0, h - 4, w * p, 4);
}

// ───────────────────────── STANDARD (/robo) ─────────────────────────

function drawStandard(ctx: Ctx, w: number, h: number, item: ArtInput, t: number) {
  const rnd = seededRandom(item.seed);
  const u = Math.min(w, h) / 100;
  const landscape = w / h > 1.2;
  const anim = item.mediaType === 'animation';
  const pulse = anim ? 0.5 + 0.5 * Math.sin(t * 2.4) : 0.5;

  // Ink Well base
  ctx.fillStyle = OBSIDIAN;
  ctx.fillRect(0, 0, w, h);

  // subject region
  const sx = landscape ? w * 0.74 : w * 0.5;
  const sy = landscape ? h * 0.52 : h * 0.7;
  const sr = landscape ? h * 0.36 : w * 0.34;

  // radial glow
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(w, h) * 0.62);
  g.addColorStop(0, `rgba(255,85,0,${0.32 + pulse * 0.14})`);
  g.addColorStop(0.45, 'rgba(255,85,0,0.08)');
  g.addColorStop(1, 'rgba(255,85,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // HUD grid
  ctx.strokeStyle = 'rgba(245,242,235,0.05)';
  ctx.lineWidth = 1;
  const step = 6 * u;
  const off = anim ? (t * 8 * u) % step : 0;
  ctx.beginPath();
  for (let x = -step + off; x < w; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = 0; y < h; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // grain
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = `rgba(245,242,235,${rnd() * 0.06})`;
    ctx.fillRect(rnd() * w, rnd() * h, u * 0.35, u * 0.35);
  }

  // subject
  const bob = anim ? Math.sin(t * 1.6) * u * 1.4 : 0;
  const subject = pickSubject(item.seed);
  ctx.save();
  ctx.translate(sx, sy + bob);
  if (subject === 'terminal') drawTerminal(ctx, sr, u, rnd, t, anim);
  else if (subject === 'mascot') drawMascot(ctx, sr, u, t, anim);
  else if (subject === 'chart') drawChart(ctx, sr, u, rnd, t, anim);
  else drawOrb(ctx, sr, u, rnd, t, anim);
  ctx.restore();

  // headline
  const headline = headlineFromPrompt(item.prompt);
  const words = headline.split(' ');
  const accent = accentWordIndex(words);
  const hx = landscape ? 6 * u : 7 * u;
  const hy = landscape ? 14 * u : 12 * u;
  const hw = landscape ? w * 0.5 : w - 14 * u;
  const hh = landscape ? h - 34 * u : h * 0.36;
  const font = outfit(700);
  const fit = fitText(ctx, headline, hw, hh, font, Math.round(landscape ? 26 * u : 20 * u), 0.98);
  ctx.font = font(fit.size);
  const lh = fit.size * 0.98;
  const blockH = fit.lines.length * lh;
  let y = landscape ? (h - blockH) / 2 + fit.size * 0.82 : hy + fit.size * 0.82;
  let wi = 0;
  for (const line of fit.lines) {
    let x = hx;
    for (const word of line.split(' ')) {
      const isAccent = wi === accent;
      ctx.fillStyle = isAccent ? ORANGE : PAPER;
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = u * 1.2;
      ctx.shadowOffsetY = u * 0.4;
      ctx.fillText(word, x, y);
      x += ctx.measureText(`${word} `).width;
      wi++;
    }
    y += lh;
  }
  ctx.shadowColor = 'transparent';
  const barY = y - lh + fit.size * 0.32;
  ctx.fillStyle = ORANGE;
  ctx.fillRect(hx, barY, Math.min(hw * 0.32, 22 * u), u * 1.1);

  // arrow from headline toward subject
  ctx.save();
  const ax = landscape ? w * 0.56 : w * 0.18;
  const ay = landscape ? h * 0.7 : h * 0.55;
  ctx.translate(ax, ay);
  ctx.rotate(landscape ? -0.35 : 0.9);
  drawArrow(ctx, 12 * u, 2.2 * u);
  ctx.restore();

  // corner badge
  const badge = pickBadge(item.seed);
  ctx.font = outfit(700)(Math.round(4.2 * u));
  const bw = ctx.measureText(badge).width + 4 * u;
  const bx = landscape ? w - bw - 4 * u : w - bw - 5 * u;
  roundRect(ctx, bx, 4 * u, bw, 7 * u, 1.4 * u);
  ctx.fillStyle = ORANGE;
  ctx.fill();
  ctx.fillStyle = OBSIDIAN;
  ctx.fillText(badge, bx + 2 * u, 4 * u + 5.3 * u);

  // watermark
  ctx.font = mono(Math.max(9, Math.round(2.4 * u)));
  ctx.fillStyle = 'rgba(245,242,235,0.32)';
  ctx.fillText('/robo · VOLTA', hx, h - 4 * u);

  if (anim) {
    // scanline sweep
    const scanY = ((t * 0.35) % 1) * h;
    const sg = ctx.createLinearGradient(0, scanY - 6 * u, 0, scanY);
    sg.addColorStop(0, 'rgba(255,85,0,0)');
    sg.addColorStop(1, 'rgba(255,85,0,0.16)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, scanY - 6 * u, w, 6 * u);
  }
}

function drawArrow(ctx: Ctx, len: number, thick: number) {
  ctx.fillStyle = ORANGE;
  ctx.beginPath();
  ctx.moveTo(0, -thick / 2);
  ctx.lineTo(len * 0.62, -thick / 2);
  ctx.lineTo(len * 0.62, -thick * 1.6);
  ctx.lineTo(len, 0);
  ctx.lineTo(len * 0.62, thick * 1.6);
  ctx.lineTo(len * 0.62, thick / 2);
  ctx.lineTo(0, thick / 2);
  ctx.closePath();
  ctx.fill();
}

function drawTerminal(ctx: Ctx, r: number, u: number, rnd: () => number, t: number, anim: boolean) {
  const W = r * 1.9;
  const H = r * 1.35;
  ctx.rotate(-0.06);
  ctx.shadowColor = 'rgba(255,85,0,0.55)';
  ctx.shadowBlur = 5 * u;
  roundRect(ctx, -W / 2, -H / 2, W, H, 2 * u);
  ctx.fillStyle = '#141413';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#3A3834';
  ctx.lineWidth = Math.max(1, u * 0.35);
  ctx.stroke();
  // title bar
  ctx.fillStyle = '#1C1B19';
  ctx.fillRect(-W / 2 + 1, -H / 2 + 1, W - 2, 6 * u);
  ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(-W / 2 + 4 * u + i * 3.2 * u, -H / 2 + 3 * u, u, 0, TAU);
    ctx.fill();
  });
  // code lines
  const rows = 7;
  const visible = anim ? Math.floor((t * 3) % (rows + 3)) : rows;
  for (let i = 0; i < Math.min(rows, visible); i++) {
    const ly = -H / 2 + 11 * u + i * ((H - 16 * u) / rows);
    const indent = (i % 3) * 3 * u;
    const len = (0.25 + rnd() * 0.5) * (W - 12 * u);
    ctx.fillStyle = i % 3 === 0 ? ORANGE : i % 3 === 1 ? 'rgba(245,242,235,0.75)' : 'rgba(163,158,147,0.6)';
    ctx.fillRect(-W / 2 + 5 * u + indent, ly, len, 1.6 * u);
  }
  // cursor
  if (!anim || Math.floor(t * 2) % 2 === 0) {
    ctx.fillStyle = ORANGE;
    ctx.fillRect(-W / 2 + 5 * u, H / 2 - 7 * u, 2.4 * u, 3.4 * u);
  }
  ctx.font = mono(Math.round(2.6 * u));
  ctx.fillStyle = 'rgba(245,242,235,0.55)';
  ctx.fillText('claude -p', -W / 2 + 9 * u, H / 2 - 4.2 * u);
}

function drawMascot(ctx: Ctx, r: number, u: number, t: number, anim: boolean) {
  const size = r * 1.7;
  const px = size / 8;
  ctx.rotate(anim ? Math.sin(t * 1.2) * 0.06 : -0.04);
  ctx.shadowColor = 'rgba(255,85,0,0.7)';
  ctx.shadowBlur = 6 * u;
  MASCOT.forEach((row, y) =>
    row.split('').forEach((c, x) => {
      if (c !== '1') return;
      ctx.fillStyle = ORANGE;
      ctx.fillRect(-size / 2 + x * px, -size / 2 + y * px, px + 0.5, px + 0.5);
    }),
  );
  ctx.shadowColor = 'transparent';
  // eyes glow
  const blink = anim && Math.floor(t * 1.5) % 4 === 0 ? 0.2 : 1;
  ctx.fillStyle = `rgba(245,242,235,${0.9 * blink})`;
  ctx.fillRect(-size / 2 + 1 * px, -size / 2 + 3 * px, px, px);
  ctx.fillRect(-size / 2 + 6 * px, -size / 2 + 3 * px, px, px);
}

function drawChart(ctx: Ctx, r: number, u: number, rnd: () => number, t: number, anim: boolean) {
  const W = r * 1.9;
  const H = r * 1.5;
  const bars = 6;
  const bw = W / (bars * 1.6);
  const grow = anim ? Math.min(1, (t % 5) / 2.2) : 1;
  ctx.strokeStyle = 'rgba(245,242,235,0.35)';
  ctx.lineWidth = Math.max(1, 0.4 * u);
  ctx.beginPath();
  ctx.moveTo(-W / 2, H / 2);
  ctx.lineTo(W / 2, H / 2);
  ctx.stroke();
  const pts: [number, number][] = [];
  for (let i = 0; i < bars; i++) {
    const v = (0.18 + (i / (bars - 1)) * 0.72 + rnd() * 0.08) * grow;
    const x = -W / 2 + i * bw * 1.6 + bw * 0.3;
    const bh = v * H;
    ctx.fillStyle = i === bars - 1 ? ORANGE : `rgba(245,242,235,${0.18 + i * 0.08})`;
    ctx.fillRect(x, H / 2 - bh, bw, bh);
    pts.push([x + bw / 2, H / 2 - bh - 3 * u]);
  }
  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 1.4 * u;
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(255,85,0,0.8)';
  ctx.shadowBlur = 3 * u;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  const [lx, ly] = pts[pts.length - 1];
  const [px, py] = pts[pts.length - 2];
  ctx.save();
  ctx.translate(lx, ly);
  ctx.rotate(Math.atan2(ly - py, lx - px));
  ctx.beginPath();
  ctx.moveTo(3 * u, 0);
  ctx.lineTo(-2 * u, -2.6 * u);
  ctx.lineTo(-2 * u, 2.6 * u);
  ctx.closePath();
  ctx.fillStyle = ORANGE;
  ctx.fill();
  ctx.restore();
  ctx.shadowColor = 'transparent';
}

function drawOrb(ctx: Ctx, r: number, u: number, rnd: () => number, t: number, anim: boolean) {
  const spin = anim ? t * 0.8 : 0.4;
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.42);
  core.addColorStop(0, '#FFD2B8');
  core.addColorStop(0.35, ORANGE);
  core.addColorStop(1, 'rgba(255,85,0,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42, 0, TAU);
  ctx.fill();
  for (let ring = 0; ring < 3; ring++) {
    const rr = r * (0.62 + ring * 0.2);
    ctx.save();
    ctx.rotate(ring * 0.5 - 0.3);
    ctx.scale(1, 0.32);
    ctx.strokeStyle = `rgba(245,242,235,${0.35 - ring * 0.08})`;
    ctx.lineWidth = Math.max(1, 0.5 * u) / 0.32;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, TAU);
    ctx.stroke();
    const n = 5 + ring * 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + spin * (ring % 2 ? -1 : 1) + rnd() * 0.2;
      ctx.fillStyle = i === 0 ? ORANGE : 'rgba(245,242,235,0.8)';
      const s = (1.6 + rnd()) * u;
      ctx.fillRect(Math.cos(a) * rr - s / 2, Math.sin(a) * rr - s / 2, s, s * 1.3);
    }
    ctx.restore();
  }
}

// ───────────────────────── WILDCARDS ─────────────────────────

function drawRiso(ctx: Ctx, w: number, h: number, item: ArtInput, t: number) {
  const rnd = seededRandom(item.seed ^ 0x51a7);
  const u = Math.min(w, h) / 100;
  const anim = item.mediaType === 'animation';
  ctx.fillStyle = '#F3EAD7';
  ctx.fillRect(0, 0, w, h);
  const drift = anim ? Math.sin(t * 1.1) * 4 * u : 0;
  const discs: [string, number, number][] = [
    ['#FF48B0', w * 0.42 + drift, h * 0.4],
    ['#0078BF', w * 0.58 - drift, h * 0.46],
  ];
  ctx.globalCompositeOperation = 'multiply';
  const R = Math.min(w, h) * 0.3;
  for (const [color, cx, cy] of discs) {
    ctx.fillStyle = color;
    const dot = 1.6 * u;
    for (let y = cy - R; y < cy + R; y += dot * 1.5) {
      for (let x = cx - R; x < cx + R; x += dot * 1.5) {
        const d = Math.hypot(x - cx, y - cy) / R;
        if (d > 1) continue;
        const rad = dot * 0.75 * (1 - d * 0.65);
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, TAU);
        ctx.fill();
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  // grain
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(26,26,26,${rnd() * 0.08})`;
    ctx.fillRect(rnd() * w, rnd() * h, u * 0.25, u * 0.25);
  }
  const headline = headlineFromPrompt(item.prompt);
  const font = (s: number) => `italic 400 ${s}px Newsreader, Georgia, serif`;
  const fit = fitText(ctx, headline.toLowerCase(), w - 14 * u, h * 0.3, font, Math.round(18 * u), 1.0);
  ctx.font = font(fit.size);
  ctx.textAlign = 'center';
  let y = h - 8 * u - (fit.lines.length - 1) * fit.size;
  for (const line of fit.lines) {
    ctx.fillStyle = 'rgba(255,72,176,0.85)';
    ctx.fillText(line, w / 2 + 0.8 * u, y + 0.6 * u);
    ctx.fillStyle = '#1A1A1A';
    ctx.fillText(line, w / 2, y);
    y += fit.size;
  }
  ctx.textAlign = 'left';
  ctx.font = mono(Math.max(9, Math.round(2.4 * u)));
  ctx.fillStyle = '#0078BF';
  ctx.fillText('RISO PRESS · 2 INK · No.' + (item.seed % 997), 5 * u, 6 * u);
}

function drawVapor(ctx: Ctx, w: number, h: number, item: ArtInput, t: number) {
  const u = Math.min(w, h) / 100;
  const anim = item.mediaType === 'animation';
  const horizon = h * 0.58;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#2B0A3D');
  sky.addColorStop(0.6, '#8A1F72');
  sky.addColorStop(1, '#FF2E88');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);
  // sun
  const R = Math.min(w, h) * 0.26;
  const sunY = horizon - R * 0.35;
  const sun = ctx.createLinearGradient(0, sunY - R, 0, sunY + R);
  sun.addColorStop(0, '#FFE66D');
  sun.addColorStop(1, '#FF2E88');
  ctx.save();
  ctx.beginPath();
  ctx.arc(w / 2, sunY, R, 0, TAU);
  ctx.clip();
  ctx.fillStyle = sun;
  ctx.fillRect(w / 2 - R, sunY - R, R * 2, R * 2);
  ctx.fillStyle = '#8A1F72';
  const shift = anim ? (t * 0.6) % 1 : 0;
  for (let i = 0; i < 7; i++) {
    const k = (i + shift) / 7;
    const yy = sunY + k * R;
    ctx.fillRect(w / 2 - R, yy, R * 2, (k * 0.9 + 0.1) * R * 0.12);
  }
  ctx.restore();
  // floor
  ctx.fillStyle = '#1A0626';
  ctx.fillRect(0, horizon, w, h - horizon);
  ctx.strokeStyle = 'rgba(255,46,136,0.85)';
  ctx.lineWidth = Math.max(1, 0.35 * u);
  ctx.beginPath();
  for (let i = -12; i <= 12; i++) {
    ctx.moveTo(w / 2 + i * u * 2, horizon);
    ctx.lineTo(w / 2 + i * w * 0.14, h);
  }
  const scroll = anim ? (t * 0.5) % 1 : 0.3;
  for (let i = 0; i < 10; i++) {
    const k = (i + scroll) / 10;
    const yy = horizon + (h - horizon) * k * k;
    ctx.moveTo(0, yy);
    ctx.lineTo(w, yy);
  }
  ctx.stroke();
  // chrome headline
  const headline = headlineFromPrompt(item.prompt);
  const font = outfit(700);
  const fit = fitText(ctx, headline, w - 12 * u, h * 0.3, font, Math.round(17 * u), 0.95);
  ctx.font = font(fit.size);
  ctx.textAlign = 'center';
  let y = 8 * u + fit.size * 0.85;
  for (const line of fit.lines) {
    const chrome = ctx.createLinearGradient(0, y - fit.size * 0.8, 0, y);
    chrome.addColorStop(0, '#FFFFFF');
    chrome.addColorStop(0.5, '#8EE3FF');
    chrome.addColorStop(0.52, '#3B1C5A');
    chrome.addColorStop(1, '#FF7AD9');
    ctx.lineWidth = Math.max(2, u * 0.8);
    ctx.strokeStyle = '#2B0A3D';
    ctx.strokeText(line, w / 2, y);
    ctx.fillStyle = chrome;
    ctx.fillText(line, w / 2, y);
    y += fit.size * 0.95;
  }
  ctx.textAlign = 'left';
}

function drawSwiss(ctx: Ctx, w: number, h: number, item: ArtInput, t: number) {
  const rnd = seededRandom(item.seed ^ 0x5e155);
  const u = Math.min(w, h) / 100;
  const anim = item.mediaType === 'animation';
  ctx.fillStyle = '#EDEBE6';
  ctx.fillRect(0, 0, w, h);
  // hairline 12-col grid
  ctx.strokeStyle = 'rgba(17,17,17,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 12; i++) {
    ctx.moveTo((w / 12) * i, 0);
    ctx.lineTo((w / 12) * i, h);
  }
  ctx.stroke();
  // red block
  const slide = anim ? Math.sin(t * 1.3) * 6 * u : 0;
  ctx.fillStyle = '#E30613';
  ctx.fillRect(w * 0.55 + slide, h * 0.12, w * 0.38, h * 0.5);
  // giant numeral
  const num = String((item.seed % 89) + 10);
  ctx.font = outfit(700)(Math.round(Math.min(w * 0.42, h * 0.62)));
  ctx.fillStyle = '#111111';
  ctx.fillText(num, w * 0.05, h * 0.62);
  // headline lowercase
  const headline = headlineFromPrompt(item.prompt).toLowerCase();
  const font = outfit(600);
  const fit = fitText(ctx, headline, w * 0.55, h * 0.24, font, Math.round(10 * u), 1.02);
  ctx.font = font(fit.size);
  ctx.fillStyle = '#111111';
  let y = h * 0.74 + fit.size * 0.8;
  for (const line of fit.lines) {
    ctx.fillText(line, w * 0.05, y);
    y += fit.size * 1.02;
  }
  // small type blocks
  ctx.font = mono(Math.max(8, Math.round(2 * u)));
  ctx.fillStyle = '#9A968E';
  for (let i = 0; i < 4; i++) {
    ctx.fillText(`${(rnd() * 100).toFixed(0).padStart(2, '0')} — grid ${i + 1}/12`, w * 0.66, h * 0.72 + i * 3.2 * u);
  }
  ctx.fillStyle = '#E30613';
  ctx.fillRect(w * 0.05, h * 0.68, w * 0.12, u * 0.9);
}

function drawAcid(ctx: Ctx, w: number, h: number, item: ArtInput, t: number) {
  const rnd = seededRandom(item.seed ^ 0xac1d);
  const u = Math.min(w, h) / 100;
  const anim = item.mediaType === 'animation';
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const phase = anim ? t * 1.4 : 0;
  ctx.lineWidth = Math.max(1, 0.6 * u);
  for (let ring = 1; ring <= 9; ring++) {
    const base = ring * Math.max(w, h) * 0.055;
    ctx.strokeStyle = ring % 2 ? '#C6FF00' : 'rgba(198,255,0,0.35)';
    ctx.beginPath();
    for (let a = 0; a <= TAU + 0.01; a += 0.08) {
      const wob = Math.sin(a * 5 + ring + phase) * u * 1.6 + Math.sin(a * 3 - phase) * u;
      const x = cx + Math.cos(a) * (base + wob);
      const y = cy + Math.sin(a) * (base + wob) * 0.8;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // sparkles
  for (let i = 0; i < 9; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const s = (1.5 + rnd() * 3) * u * (anim ? 0.7 + 0.3 * Math.sin(t * 3 + i) : 1);
    ctx.fillStyle = i % 3 ? '#FFFFFF' : '#FF00E5';
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.quadraticCurveTo(x, y, x + s, y);
    ctx.quadraticCurveTo(x, y, x, y + s);
    ctx.quadraticCurveTo(x, y, x - s, y);
    ctx.quadraticCurveTo(x, y, x, y - s);
    ctx.fill();
  }
  const headline = headlineFromPrompt(item.prompt);
  const font = outfit(700);
  const fit = fitText(ctx, headline, w - 14 * u, h * 0.42, font, Math.round(19 * u), 0.95);
  ctx.font = font(fit.size);
  ctx.textAlign = 'center';
  let y = cy - ((fit.lines.length - 1) * fit.size * 0.95) / 2 + fit.size * 0.35;
  for (const line of fit.lines) {
    ctx.fillStyle = '#FF00E5';
    ctx.fillText(line, cx + u, y + u);
    ctx.lineWidth = Math.max(1.5, 0.7 * u);
    ctx.strokeStyle = '#C6FF00';
    ctx.fillStyle = '#050505';
    ctx.fillText(line, cx, y);
    ctx.strokeText(line, cx, y);
    y += fit.size * 0.95;
  }
  ctx.textAlign = 'left';
}

function drawBauhaus(ctx: Ctx, w: number, h: number, item: ArtInput, t: number) {
  const u = Math.min(w, h) / 100;
  const anim = item.mediaType === 'animation';
  const rot = anim ? t * 0.6 : 0;
  ctx.fillStyle = '#F0E6D2';
  ctx.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  // circle
  ctx.fillStyle = '#E63946';
  ctx.beginPath();
  ctx.arc(w * 0.3, h * 0.34, m * 0.22, 0, TAU);
  ctx.fill();
  // triangle
  ctx.save();
  ctx.translate(w * 0.7, h * 0.36);
  ctx.rotate(rot);
  ctx.fillStyle = '#1D3557';
  ctx.beginPath();
  ctx.moveTo(0, -m * 0.22);
  ctx.lineTo(m * 0.2, m * 0.14);
  ctx.lineTo(-m * 0.2, m * 0.14);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // quarter disc
  ctx.fillStyle = '#F4A261';
  ctx.beginPath();
  ctx.moveTo(w, h);
  ctx.arc(w, h, m * 0.34, Math.PI, Math.PI * 1.5);
  ctx.closePath();
  ctx.fill();
  // bar
  ctx.fillStyle = '#111111';
  ctx.save();
  ctx.translate(w * 0.5, h * 0.58);
  ctx.rotate(-0.2 - rot * 0.2);
  ctx.fillRect(-w * 0.4, -u, w * 0.8, 2 * u);
  ctx.restore();
  const headline = headlineFromPrompt(item.prompt);
  const font = outfit(700);
  const fit = fitText(ctx, headline, w * 0.62, h * 0.26, font, Math.round(12 * u), 0.98);
  ctx.font = font(fit.size);
  ctx.fillStyle = '#111111';
  let y = h - 7 * u - (fit.lines.length - 1) * fit.size * 0.98;
  for (const line of fit.lines) {
    ctx.fillText(line, 6 * u, y);
    y += fit.size * 0.98;
  }
}
