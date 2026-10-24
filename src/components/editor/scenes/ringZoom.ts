import { ARTIFACTS } from '@/lib/mock-data';
import { C, type SceneDef, clamp01, drawBackdrop, drawHudChrome, easeInOutCubic, easeOutBack, hexA, lerp, panel, roundRect, seg, text } from './common';

const TYPE_COLOR: Record<string, string> = { deck: C.orange, pdf: C.red, html: C.teal, image: C.purple, doc: C.blue };
const MATCH = Math.max(0, ARTIFACTS.findIndex((a) => /betashares/i.test(a.clientOrTag)));

/** Scene 2 — orbital artifact ring with camera zoom, BETASHARES match and skills-deck popover. */
export const ringZoom: SceneDef = {
  key: 'ring-zoom',
  label: 'Orbital Artifact Ring Zoom',
  hotspots: [
    { label: 'Skills Deck Popover', x: 67, y: 60, w: 30, h: 34 },
    { label: 'Artifact Search Bar', x: 4, y: 8, w: 34, h: 12 },
    { label: 'Orbital Artifact Ring', x: 26, y: 12, w: 66, h: 62 },
  ],
  draw(ctx, w, h, t, d) {
    const u = h / 100;
    const cx = w * 0.58;
    const cy = h * 0.43;
    drawBackdrop(ctx, w, h, t, { x: 0.58, y: 0.43, strength: 0.22 });
    const zoom = lerp(0.62, 1.12, easeInOutCubic(seg(t, 1.5, 22))) + Math.sin(t * 0.5) * 0.015;
    const R = 34 * u * zoom;
    const tilt = 0.36;
    const rot = t * 0.12;

    // ring path
    ctx.save();
    ctx.strokeStyle = hexA(C.paper, 0.12);
    ctx.setLineDash([0.6 * u, 1.2 * u]);
    ctx.lineWidth = Math.max(1, 0.15 * u);
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * 1.25, R * tilt * 1.25, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = hexA(C.orange, 0.25);
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * 1.25, R * tilt * 1.25, 0, rot * 2, rot * 2 + 0.9);
    ctx.stroke();
    ctx.restore();

    // nodes sorted back-to-front
    const n = ARTIFACTS.length;
    const nodes = ARTIFACTS.map((a, i) => {
      const ang = (i / n) * Math.PI * 2 + rot;
      return { a, i, x: cx + Math.cos(ang) * R * 1.25, y: cy + Math.sin(ang) * R * tilt * 1.25, z: Math.sin(ang) };
    }).sort((p, q) => p.z - q.z);

    // core (drawn mid-depth)
    const drawCore = () => {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 13 * u * zoom);
      g.addColorStop(0, hexA(C.orange, 0.55));
      g.addColorStop(0.45, hexA(C.orange, 0.12));
      g.addColorStop(1, 'rgba(255,85,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 13 * u * zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexA(C.orange, 0.7);
      ctx.lineWidth = 0.3 * u;
      ctx.beginPath();
      ctx.arc(cx, cy, 5.5 * u * zoom, 0, Math.PI * 2);
      ctx.stroke();
      text(ctx, 'VOLTA', cx, cy + 0.6 * u, { size: 3.4 * u * zoom, weight: 800, family: 'doto', align: 'center', base: 'middle' });
      text(ctx, `${n} ARTIFACTS`, cx, cy + 4.2 * u * zoom, { size: 1.5 * u * zoom, family: 'mono', color: C.sec, align: 'center', track: 0.2 * u });
    };

    const matchOn = seg(t, 8, 9.5);
    let coreDrawn = false;
    for (const nd of nodes) {
      if (!coreDrawn && nd.z > 0) {
        drawCore();
        coreDrawn = true;
      }
      const depth = (nd.z + 1) / 2; // 0 back .. 1 front
      const s = (0.55 + depth * 0.65) * zoom;
      const isMatch = nd.i === MATCH;
      const cw = 6.2 * u * s;
      const ch = 3.8 * u * s;
      const col = TYPE_COLOR[nd.a.type] ?? C.sec;
      ctx.save();
      ctx.globalAlpha = 0.25 + depth * 0.75;
      if (isMatch && matchOn > 0) {
        ctx.shadowColor = C.orange;
        ctx.shadowBlur = (1.2 + 0.8 * Math.sin(t * 4)) * 2.2 * u * matchOn;
      }
      roundRect(ctx, nd.x - cw / 2, nd.y - ch / 2, cw, ch, 0.6 * u * s);
      ctx.fillStyle = isMatch && matchOn > 0 ? hexA(C.orange, 0.25 + 0.2 * matchOn) : C.elev;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, 0.12 * u * s);
      ctx.strokeStyle = isMatch && matchOn > 0 ? C.orange : hexA(col, 0.55);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.fillRect(nd.x - cw / 2, nd.y - ch / 2, cw * 0.12, ch);
      if (depth > 0.55 || isMatch) {
        text(ctx, nd.a.clientOrTag.slice(0, 11), nd.x + cw * 0.04, nd.y + 0.5 * u * s, {
          size: 1.05 * u * s,
          family: 'mono',
          weight: 600,
          align: 'center',
          base: 'middle',
          color: isMatch && matchOn > 0 ? C.paper : C.sec,
        });
      }
      ctx.restore();
    }
    if (!coreDrawn) drawCore();

    // search bar (types "betashares")
    const query = 'betashares';
    const typed = query.slice(0, Math.floor(seg(t, 4.5, 8) * query.length));
    const bx = w * 0.05;
    const by = h * 0.1;
    panel(ctx, bx, by, w * 0.3, 7 * u, 1.2 * u, typed.length ? hexA(C.orange, 0.6) : C.border);
    text(ctx, 'SEARCH ARTIFACTS', bx + 1.6 * u, by + 2.6 * u, { size: 1.4 * u, family: 'mono', color: C.muted, track: 0.2 * u });
    const caret = Math.floor(t * 2) % 2 ? '▌' : '';
    text(ctx, `/ ${typed}${caret}`, bx + 1.6 * u, by + 5.6 * u, { size: 2.3 * u, family: 'mono', color: C.paper });
    if (matchOn > 0) text(ctx, '3 MATCHES', bx + w * 0.3 - 1.6 * u, by + 5.6 * u, { size: 1.5 * u, family: 'mono', color: C.orange, align: 'right', alpha: matchOn });

    // skills deck popover (bottom-right) — opens late in the clip
    const pop = easeOutBack(seg(t, d * 0.6, d * 0.6 + 0.9));
    if (pop > 0) {
      const pw = w * 0.28;
      const ph = h * 0.3;
      const px = w * 0.685;
      const py = h * 0.62;
      ctx.save();
      ctx.translate(px + pw, py + ph);
      ctx.scale(clamp01(pop) * 0.2 + pop * 0.8, clamp01(pop) * 0.2 + pop * 0.8);
      ctx.translate(-(px + pw), -(py + ph));
      ctx.globalAlpha = clamp01(pop);
      panel(ctx, px, py, pw, ph, 1.4 * u, hexA(C.orange, 0.5), 'rgba(20,20,19,0.95)');
      text(ctx, 'SKILLS DECK · MODEL × EFFORT', px + 1.8 * u, py + 3.6 * u, { size: 1.5 * u, family: 'mono', color: C.orange, track: 0.2 * u });
      const models = [
        ['HAIKU', C.teal],
        ['SONNET', C.amber],
        ['OPUS', C.orange],
      ] as const;
      const efforts = ['LOW', 'MED', 'HIGH', 'MAX'];
      const gx = px + 9.5 * u;
      const cellW = (pw - 11.5 * u) / 4;
      efforts.forEach((e, j) => text(ctx, e, gx + cellW * j + cellW / 2, py + 7.2 * u, { size: 1.2 * u, family: 'mono', color: C.muted, align: 'center' }));
      models.forEach(([m, col], i) => {
        const ry = py + 9 * u + i * 6 * u;
        text(ctx, m, px + 1.8 * u, ry + 3 * u, { size: 1.6 * u, family: 'mono', weight: 700, color: col });
        for (let j = 0; j < 4; j++) {
          const lit = (i + j + Math.floor(t * 1.5)) % 5 === 0 || (i === 2 && j === 2);
          roundRect(ctx, gx + cellW * j + 0.3 * u, ry, cellW - 0.6 * u, 4.4 * u, 0.6 * u);
          ctx.fillStyle = lit ? hexA(col, 0.55) : C.elev;
          ctx.fill();
        }
      });
      ctx.restore();
    }
    drawHudChrome(ctx, w, h, t, 'SCENE 02 // ARTIFACT RING');
  },
};
