import { TOTAL_BRAIN_FILES } from '@/lib/mock-data';
import { C, type SceneDef, clamp01, countUp, drawBackdrop, drawHudChrome, easeOutCubic, hexA, noise, seg, text } from './common';

const DEPTS = [
  { name: 'SKILLS', color: '#FFFFFF' },
  { name: 'BUSINESS', color: '#FF6B2B' },
  { name: 'CONTENT', color: '#EF4444' },
  { name: 'PERSONAL', color: '#06B6D4' },
  { name: 'PRODUCT', color: '#3B82F6' },
  { name: 'COMMUNITY', color: '#10B981' },
  { name: 'ROUTINES', color: '#F5A623' },
  { name: 'APPS', color: '#8B5CF6' },
];

const N = 520;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
// Fibonacci sphere (unit), computed once — pure math, deterministic.
const POINTS = Array.from({ length: N }, (_, i) => {
  const y = 1 - (i / (N - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const th = GOLDEN * i;
  return { x: Math.cos(th) * r, y, z: Math.sin(th) * r, d: Math.floor(noise(i * 1.7) * DEPTS.length) };
});
const EDGES: [number, number][] = Array.from({ length: 70 }, (_, k) => {
  const a = Math.floor(noise(k * 5.3) * N);
  return [a, (a + 1 + Math.floor(noise(k * 2.9) * 12)) % N];
});

/** Scene 6 — rotating dotted Second Brain orb with department colours and a file counter. */
export const brainOrb: SceneDef = {
  key: 'brain-orb',
  label: 'Second Brain Dotted Orb',
  hotspots: [
    { label: 'File Counter', x: 3, y: 70, w: 30, h: 22 },
    { label: 'Department Legend', x: 78, y: 14, w: 20, h: 56 },
    { label: 'Second Brain Dot Orb', x: 28, y: 12, w: 48, h: 76 },
  ],
  draw(ctx, w, h, t) {
    const u = h / 100;
    drawBackdrop(ctx, w, h, t, { x: 0.52, y: 0.5, strength: 0.16, color: C.purple });
    const cx = w * 0.52;
    const cy = h * 0.5;
    const intro = easeOutCubic(seg(t, 0, 3));
    const R = 33 * u * (0.4 + 0.6 * intro);
    const ry = t * 0.22;
    const rx = 0.38 + Math.sin(t * 0.15) * 0.06;
    const cosY = Math.cos(ry);
    const sinY = Math.sin(ry);
    const cosX = Math.cos(rx);
    const sinX = Math.sin(rx);
    const proj = POINTS.map((p) => {
      const x1 = p.x * cosY + p.z * sinY;
      const z1 = -p.x * sinY + p.z * cosY;
      const y2 = p.y * cosX - z1 * sinX;
      const z2 = p.y * sinX + z1 * cosX;
      const persp = 1 / (1.9 - z2 * 0.6);
      return { sx: cx + x1 * R * persp * 1.3, sy: cy + y2 * R * persp * 1.3, z: z2, d: p.d };
    });

    // edges
    ctx.save();
    ctx.lineWidth = Math.max(1, 0.1 * u);
    for (const [a, b] of EDGES) {
      const pa = proj[a];
      const pb = proj[b];
      const al = clamp01((pa.z + pb.z + 1) / 3) * 0.35 * intro;
      ctx.strokeStyle = hexA(DEPTS[pa.d].color, al);
      ctx.beginPath();
      ctx.moveTo(pa.sx, pa.sy);
      ctx.lineTo(pb.sx, pb.sy);
      ctx.stroke();
    }
    ctx.restore();

    // dots back to front
    const order = proj.map((p, i) => i).sort((a, b) => proj[a].z - proj[b].z);
    const highlight = Math.floor(t * 1.5) % N;
    for (const i of order) {
      const p = proj[i];
      const depth = (p.z + 1) / 2;
      const s = (0.25 + depth * 0.55) * u;
      const reveal = clamp01(seg(t, noise(i) * 2.2, noise(i) * 2.2 + 0.6));
      if (reveal <= 0) continue;
      ctx.globalAlpha = (0.18 + depth * 0.82) * reveal;
      ctx.fillStyle = DEPTS[p.d].color;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, s, 0, Math.PI * 2);
      ctx.fill();
      if (i === highlight || (i * 7) % N === highlight) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = C.orange;
        ctx.lineWidth = 0.25 * u;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, s * 3 + Math.sin(t * 6) * 0.3 * u, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // file counter
    text(ctx, countUp(TOTAL_BRAIN_FILES, seg(t, 0.5, 6)), w * 0.05, h * 0.82, { size: 7 * u, weight: 800, family: 'doto', color: C.paper });
    text(ctx, 'FILES CLAUDE CAN READ', w * 0.05, h * 0.87, { size: 1.7 * u, family: 'mono', color: C.orange, track: 0.4 * u });

    // legend
    DEPTS.forEach((dp, i) => {
      const a = seg(t, 1 + i * 0.25, 1.6 + i * 0.25);
      const y = h * 0.2 + i * 5.6 * u;
      ctx.globalAlpha = a;
      ctx.fillStyle = dp.color;
      ctx.beginPath();
      ctx.arc(w * 0.81, y - 0.6 * u, 0.7 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      text(ctx, dp.name, w * 0.83, y, { size: 1.6 * u, family: 'mono', color: C.sec, alpha: a, track: 0.2 * u });
    });
    drawHudChrome(ctx, w, h, t, 'SCENE 05 // SECOND BRAIN');
  },
};
