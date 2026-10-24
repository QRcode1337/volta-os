import { USAGE_SNAPSHOT } from '@/lib/mock-data';
import { C, type SceneDef, clamp01, countUp, drawBackdrop, drawHudChrome, easeOutBack, hexA, noise, panel, roundRect, seg, text } from './common';

const PROMPTS = ['/clean-up downloads', 'summarize inbox', 'draft thumbnail copy', 'refactor router.ts', '/brandwatch scan', 'write Q4 sponsor deck', 'tag 40 clips', 'reply to Betashares', 'plan ARMS video', 'fix cron at 09:00'];
const LANES = [
  { name: 'HAIKU', color: C.teal, pct: 41, y: 0.28 },
  { name: 'SONNET', color: C.amber, pct: 38, y: 0.5 },
  { name: 'OPUS', color: C.orange, pct: 21, y: 0.72 },
];

function bez(p0: number, p1: number, p2: number, p3: number, t: number) {
  const m = 1 - t;
  return m * m * m * p0 + 3 * m * m * t * p1 + 3 * m * t * t * p2 + t * t * t * p3;
}

/** Scene 7 — Jev router flow: prompt queue → router node → model lanes, with live stats. */
export const jevRouter: SceneDef = {
  key: 'jev-router',
  label: 'Jev Router Flow Stats',
  hotspots: [
    { label: 'Routing Stats Bar', x: 0, y: 85, w: 100, h: 15 },
    { label: 'Incoming Prompt Queue', x: 3, y: 16, w: 26, h: 68 },
    { label: 'Jev Router Node', x: 35, y: 32, w: 24, h: 36 },
    { label: 'Model Lanes', x: 62, y: 14, w: 36, h: 72 },
  ],
  draw(ctx, w, h, t) {
    const u = h / 100;
    drawBackdrop(ctx, w, h, t, { x: 0.47, y: 0.5, strength: 0.18 });
    const rx = w * 0.47;
    const ry = h * 0.5;

    // prompt queue (scrolling up)
    const qx = w * 0.04;
    const qw = w * 0.23;
    text(ctx, 'INCOMING', qx, h * 0.15, { size: 1.6 * u, family: 'mono', color: C.sec, track: 0.4 * u });
    ctx.save();
    ctx.beginPath();
    ctx.rect(qx - 1, h * 0.17, qw + 2, h * 0.66);
    ctx.clip();
    const speed = 0.9;
    for (let k = 0; k < 9; k++) {
      const idx = Math.floor(t * speed) + k;
      const frac = (t * speed) % 1;
      const y = h * 0.18 + (k - frac) * 8 * u;
      const a = clamp01(Math.min((y - h * 0.17) / (4 * u), (h * 0.83 - y) / (4 * u)));
      ctx.globalAlpha = a;
      panel(ctx, qx, y, qw, 6.2 * u, 1 * u, k === 0 ? hexA(C.orange, 0.6) : C.border);
      text(ctx, PROMPTS[idx % PROMPTS.length], qx + 1.4 * u, y + 3.9 * u, { size: 1.9 * u, family: 'mono', color: C.paper });
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // lane curves + particles
    const lx = w * 0.66;
    LANES.forEach((L, li) => {
      const ly = h * L.y;
      const draw = clamp01(seg(t, 0.8 + li * 0.3, 2 + li * 0.3));
      ctx.save();
      ctx.strokeStyle = hexA(L.color, 0.35);
      ctx.lineWidth = Math.max(1, 0.25 * u);
      ctx.setLineDash([1 * u, 0.8 * u]);
      ctx.lineDashOffset = -t * 4 * u;
      ctx.beginPath();
      const steps = 30;
      for (let s = 0; s <= steps * draw; s++) {
        const tt = s / steps;
        const x = bez(rx + 6 * u, rx + 14 * u, lx - 10 * u, lx, tt);
        const y = bez(ry, ry, ly, ly, tt);
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
      // particles weighted by lane share
      const count = Math.round(L.pct / 6);
      for (let k = 0; k < count; k++) {
        const ph = ((t * (0.35 + noise(k + li * 10) * 0.25) + noise(k * 3 + li)) % 1) * draw;
        const x = bez(rx + 6 * u, rx + 14 * u, lx - 10 * u, lx, ph);
        const y = bez(ry, ry, ly, ly, ph);
        ctx.fillStyle = L.color;
        ctx.shadowColor = L.color;
        ctx.shadowBlur = 1.2 * u;
        ctx.beginPath();
        ctx.arc(x, y, 0.55 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      // lane card
      const cardIn = easeOutBack(seg(t, 1.6 + li * 0.3, 2.4 + li * 0.3));
      if (cardIn > 0) {
        ctx.save();
        ctx.globalAlpha = clamp01(cardIn);
        const cw = w * 0.3;
        const chh = 13 * u;
        panel(ctx, lx, ly - chh / 2, cw, chh, 1.2 * u, hexA(L.color, 0.55));
        text(ctx, L.name, lx + 1.6 * u, ly - 1.6 * u, { size: 2.6 * u, weight: 700, family: 'mono', color: L.color });
        text(ctx, `${countUp(L.pct, seg(t, 2, 5))}%`, lx + cw - 1.6 * u, ly + 0.6 * u, { size: 5.4 * u, weight: 800, family: 'doto', color: C.paper, align: 'right' });
        const calls = Math.round((USAGE_SNAPSHOT.jev.routes * L.pct) / 100);
        text(ctx, `${countUp(calls, seg(t, 2, 6))} calls`, lx + 1.6 * u, ly + 3.4 * u, { size: 1.6 * u, family: 'mono', color: C.sec });
        roundRect(ctx, lx + 1.6 * u, ly + 4.6 * u, cw - 3.2 * u, 0.8 * u, 0.4 * u);
        ctx.fillStyle = C.elev;
        ctx.fill();
        roundRect(ctx, lx + 1.6 * u, ly + 4.6 * u, (cw - 3.2 * u) * (L.pct / 100) * clamp01(seg(t, 2, 4)), 0.8 * u, 0.4 * u);
        ctx.fillStyle = L.color;
        ctx.fill();
        ctx.restore();
      }
    });

    // feed line queue → router
    ctx.save();
    ctx.strokeStyle = hexA(C.paper, 0.18);
    ctx.lineWidth = Math.max(1, 0.2 * u);
    ctx.beginPath();
    ctx.moveTo(qx + qw + 1 * u, h * 0.215);
    ctx.bezierCurveTo(qx + qw + 8 * u, h * 0.215, rx - 14 * u, ry, rx - 7 * u, ry);
    ctx.stroke();
    ctx.restore();

    // router node (hexagon)
    const pulse = 1 + Math.sin(t * 3) * 0.04;
    const r = 8 * u * pulse;
    ctx.save();
    const g = ctx.createRadialGradient(rx, ry, 0, rx, ry, r * 2.2);
    g.addColorStop(0, hexA(C.orange, 0.35));
    g.addColorStop(1, 'rgba(255,85,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(rx, ry, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const x = rx + Math.cos(a) * r;
      const y = ry + Math.sin(a) * r;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.strokeStyle = C.orange;
    ctx.lineWidth = 0.35 * u;
    ctx.stroke();
    ctx.strokeStyle = hexA(C.orange, 0.5);
    ctx.lineWidth = 0.2 * u;
    ctx.beginPath();
    ctx.arc(rx, ry, r * 1.35, t * 1.4, t * 1.4 + Math.PI * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rx, ry, r * 1.35, t * 1.4 + Math.PI, t * 1.4 + Math.PI * 1.6);
    ctx.stroke();
    ctx.restore();
    text(ctx, 'JEV', rx, ry + 0.4 * u, { size: 4.6 * u, weight: 800, family: 'doto', align: 'center', base: 'middle' });
    text(ctx, 'ROUTER', rx, ry + 4.4 * u, { size: 1.3 * u, family: 'mono', color: C.sec, align: 'center', track: 0.3 * u });

    // stats bar
    const sy = h * 0.88;
    ctx.fillStyle = 'rgba(20,20,19,0.85)';
    ctx.fillRect(0, sy, w, h * 0.12);
    ctx.fillStyle = hexA(C.orange, 0.6);
    ctx.fillRect(0, sy, w, Math.max(1, 0.15 * u));
    const j = USAGE_SNAPSHOT.jev;
    const stats = [
      [countUp(j.routes, seg(t, 1, 5)), 'CALLS'],
      [`$${countUp(j.totalUsd, seg(t, 1, 5), 2)}`, 'TOTAL SPEND'],
      [`${countUp(j.haikuPct, seg(t, 1, 5))}%`, 'ROUTED TO HAIKU'],
      ['6ms', 'ROUTE LATENCY'],
    ];
    stats.forEach(([v, l], i) => {
      const x = w * (0.06 + i * 0.24);
      text(ctx, v, x, sy + 6.6 * u, { size: 4.2 * u, weight: 800, family: 'doto', color: i === 1 ? C.orange : C.paper });
      text(ctx, l, x, sy + 9.8 * u, { size: 1.4 * u, family: 'mono', color: C.sec, track: 0.3 * u });
    });
    drawHudChrome(ctx, w, h, t, 'SCENE 07 // JEV ROUTER');
  },
};
