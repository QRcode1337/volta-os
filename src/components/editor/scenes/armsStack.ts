import { C, type SceneDef, clamp01, countUp, drawBackdrop, drawHudChrome, easeOutBack, easeOutCubic, hexA, seg, text } from './common';

const LAYERS = [
  { key: 'A', name: 'APPS', color: C.blue, stat: 12, unit: 'connectors' },
  { key: 'R', name: 'ROUTINES', color: C.amber, stat: 9, unit: 'scheduled jobs' },
  { key: 'M', name: 'MEMORY', color: C.green, stat: 1840, unit: 'notes' },
  { key: 'S', name: 'SKILLS', color: C.orange, stat: 24, unit: 'slash commands' },
] as const;

function shade(hex: string, k: number): string {
  const h = hex.replace('#', '');
  const ch = (i: number) => Math.round(parseInt(h.slice(i, i + 2), 16) * k);
  return `rgb(${ch(0)},${ch(2)},${ch(4)})`;
}

/** Scene 3 — isometric ARMS stack building bottom-up with a legend panel. */
export const armsStack: SceneDef = {
  key: 'arms-stack',
  label: 'ARMS Framework Stack',
  hotspots: [
    { label: 'ARMS Legend Panel', x: 60, y: 12, w: 37, h: 76 },
    { label: 'ARMS Layer Stack', x: 10, y: 14, w: 50, h: 80 },
  ],
  draw(ctx, w, h, t) {
    const u = h / 100;
    drawBackdrop(ctx, w, h, t, { x: 0.36, y: 0.6, strength: 0.18 });
    const cx = w * 0.35;
    const baseY = h * 0.8;
    const sw = 17 * u; // half width of slab diamond
    const sd = 8.5 * u; // half depth
    const th = 7 * u; // thickness
    const gap = 3.2 * u;

    // floor shadow
    ctx.save();
    ctx.fillStyle = 'rgba(255,85,0,0.08)';
    ctx.beginPath();
    ctx.ellipse(cx, baseY + sd + 1.5 * u, sw * 1.45, sd * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    LAYERS.forEach((L, i) => {
      const start = 1 + i * 2.2;
      const p = easeOutBack(seg(t, start, start + 1.1));
      const a = clamp01(seg(t, start, start + 0.4));
      if (a <= 0) return;
      const bob = Math.sin(t * 1.2 + i * 0.8) * 0.5 * u;
      const y = baseY - i * (th + gap) - (1 - p) * 30 * u + bob;
      ctx.save();
      ctx.globalAlpha = a;
      // top face
      ctx.beginPath();
      ctx.moveTo(cx, y - sd);
      ctx.lineTo(cx + sw, y);
      ctx.lineTo(cx, y + sd);
      ctx.lineTo(cx - sw, y);
      ctx.closePath();
      ctx.fillStyle = shade(L.color, 0.95);
      ctx.fill();
      // left face
      ctx.beginPath();
      ctx.moveTo(cx - sw, y);
      ctx.lineTo(cx, y + sd);
      ctx.lineTo(cx, y + sd + th);
      ctx.lineTo(cx - sw, y + th);
      ctx.closePath();
      ctx.fillStyle = shade(L.color, 0.55);
      ctx.fill();
      // right face
      ctx.beginPath();
      ctx.moveTo(cx + sw, y);
      ctx.lineTo(cx, y + sd);
      ctx.lineTo(cx, y + sd + th);
      ctx.lineTo(cx + sw, y + th);
      ctx.closePath();
      ctx.fillStyle = shade(L.color, 0.38);
      ctx.fill();
      // scanning sheen on the top face
      const sx = ((t * 0.35 + i * 0.25) % 1) * 2 - 1;
      ctx.beginPath();
      ctx.moveTo(cx, y - sd);
      ctx.lineTo(cx + sw, y);
      ctx.lineTo(cx, y + sd);
      ctx.lineTo(cx - sw, y);
      ctx.closePath();
      ctx.clip();
      const g = ctx.createLinearGradient(cx + sx * sw - 4 * u, 0, cx + sx * sw + 4 * u, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.28)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - sw, y - sd, sw * 2, sd * 2);
      ctx.restore();
      // letter on top face
      text(ctx, L.key, cx, y + 0.4 * u, { size: 6 * u, weight: 800, family: 'doto', color: C.bg, align: 'center', base: 'middle', alpha: a * 0.85 });
      // leader line + label
      const la = easeOutCubic(seg(t, start + 0.6, start + 1.4));
      if (la > 0) {
        ctx.save();
        ctx.globalAlpha = la;
        ctx.strokeStyle = hexA(L.color, 0.7);
        ctx.lineWidth = Math.max(1, 0.15 * u);
        ctx.beginPath();
        ctx.moveTo(cx + sw, y + th / 2);
        ctx.lineTo(cx + sw + 6 * u * la, y + th / 2);
        ctx.stroke();
        text(ctx, L.name, cx + sw + 7 * u, y + th / 2 - 0.4 * u, { size: 2.4 * u, weight: 700, color: C.paper, track: 0.3 * u });
        text(ctx, `${countUp(L.stat, seg(t, start + 0.6, start + 2.4))} ${L.unit}`, cx + sw + 7 * u, y + th / 2 + 2.8 * u, { size: 1.6 * u, family: 'mono', color: L.color });
        ctx.restore();
      }
    });

    // legend panel: giant ARMS letters lighting in sequence
    const px = w * 0.63;
    text(ctx, 'THE FRAMEWORK', px, h * 0.2, { size: 1.8 * u, family: 'mono', color: C.sec, track: 0.5 * u, alpha: seg(t, 0.5, 1.2) });
    LAYERS.forEach((L, i) => {
      const on = seg(t, 1.6 + i * 2.2, 2.2 + i * 2.2);
      const pulse = i === Math.floor(t / 2) % 4 && t > 10 ? 1 : 0;
      ctx.save();
      if (on > 0) {
        ctx.shadowColor = L.color;
        ctx.shadowBlur = (1 + pulse) * 2 * u * on;
      }
      text(ctx, L.key, px + i * 7.6 * u, h * 0.4, { size: 14 * u, weight: 800, family: 'doto', color: on > 0.5 ? L.color : C.hi });
      ctx.restore();
    });
    const lines = ['Apps — connectors & MCPs', 'Routines — scheduled agents', 'Memory — plain-text context', 'Skills — routable commands'];
    lines.forEach((s, i) => {
      text(ctx, s, px, h * 0.52 + i * 5.2 * u, { size: 2.5 * u, weight: 500, color: i === Math.floor(t / 2) % 4 && t > 10 ? C.paper : C.sec, alpha: seg(t, 2 + i * 2.2, 2.8 + i * 2.2) });
    });
    text(ctx, 'PLAIN TEXT · ROUTABLE · LOCAL', px, h * 0.8, { size: 1.7 * u, family: 'mono', color: C.orange, track: 0.4 * u, alpha: seg(t, 10, 11) });
    drawHudChrome(ctx, w, h, t, 'SCENE 03 // ARMS STACK');
  },
};
