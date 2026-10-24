import { C, type SceneDef, clamp01, countUp, drawBackdrop, drawHudChrome, easeOutBack, easeOutCubic, hexA, noise, panel, roundRect, seg, text } from './common';

/** Scene 4 — 80/20 split: brand-aligned grid vs glitching wildcard slice, with split bars. */
export const wildcardSplit: SceneDef = {
  key: 'wildcard-split',
  label: 'Wildcard 80/20 Split',
  hotspots: [
    { label: 'Wildcard 20% Slice', x: 60, y: 18, w: 35, h: 70 },
    { label: 'Brand-Aligned 80% Block', x: 5, y: 18, w: 54, h: 70 },
    { label: '80/20 Split Bar', x: 5, y: 6, w: 90, h: 12 },
  ],
  draw(ctx, w, h, t, d) {
    const u = h / 100;
    drawBackdrop(ctx, w, h, t, { x: 0.7, y: 0.4, color: C.purple, strength: 0.14 });

    // split bar
    const bx = w * 0.06;
    const bw = w * 0.88;
    const by = h * 0.1;
    const bh = 3.2 * u;
    const fill = easeOutCubic(seg(t, 0.5, 2.6));
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = C.elev;
    ctx.fill();
    ctx.save();
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.clip();
    ctx.fillStyle = C.orange;
    ctx.fillRect(bx, by, bw * 0.8 * fill, bh);
    const wg = ctx.createLinearGradient(bx + bw * 0.8, 0, bx + bw, 0);
    wg.addColorStop(0, C.purple);
    wg.addColorStop(0.5, C.teal);
    wg.addColorStop(1, C.amber);
    ctx.fillStyle = wg;
    ctx.fillRect(bx + bw * 0.8, by, bw * 0.2 * fill, bh);
    ctx.restore();
    text(ctx, `${countUp(80, seg(t, 0.5, 2.6))}%`, bx, by + bh + 3.6 * u, { size: 3 * u, weight: 800, family: 'doto', color: C.orange });
    text(ctx, `${countUp(20, seg(t, 0.5, 2.6))}%`, bx + bw, by + bh + 3.6 * u, { size: 3 * u, weight: 800, family: 'doto', color: C.purple, align: 'right' });

    // left: brand-aligned panel
    const lx = w * 0.06;
    const ly = h * 0.22;
    const lw = w * 0.52;
    const lh = h * 0.64;
    panel(ctx, lx, ly, lw, lh, 1.4 * u);
    text(ctx, 'BRAND-ALIGNED · /thumb + /robo', lx + 1.8 * u, ly + 3.6 * u, { size: 1.6 * u, family: 'mono', color: C.orange, track: 0.25 * u });
    const cols = 4;
    const rows = 3;
    const gw = (lw - 3.6 * u - (cols - 1) * 1.4 * u) / cols;
    const gh = (lh - 7 * u - (rows - 1) * 1.4 * u) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const p = easeOutBack(seg(t, 1 + i * 0.12, 1.6 + i * 0.12));
        if (p <= 0) continue;
        const x = lx + 1.8 * u + c * (gw + 1.4 * u);
        const y = ly + 5.4 * u + r * (gh + 1.4 * u);
        ctx.save();
        ctx.globalAlpha = clamp01(p);
        ctx.translate(x + gw / 2, y + gh / 2);
        ctx.scale(p, p);
        roundRect(ctx, -gw / 2, -gh / 2, gw, gh, 0.8 * u);
        ctx.fillStyle = C.elev;
        ctx.fill();
        ctx.strokeStyle = C.border;
        ctx.stroke();
        // consistent thumbnail layout: headline bar, face circle, orange tag
        ctx.fillStyle = C.paper;
        ctx.fillRect(-gw / 2 + 1 * u, -gh / 2 + 1.2 * u, gw * 0.55, 1.1 * u);
        ctx.fillStyle = hexA(C.paper, 0.4);
        ctx.fillRect(-gw / 2 + 1 * u, -gh / 2 + 3 * u, gw * 0.35, 0.8 * u);
        ctx.fillStyle = hexA(C.orange, 0.85);
        ctx.fillRect(-gw / 2 + 1 * u, gh / 2 - 2.4 * u, gw * 0.3, 1.4 * u);
        ctx.fillStyle = hexA(C.sec, 0.5);
        ctx.beginPath();
        ctx.arc(gw / 2 - gh * 0.3, gh * 0.08, gh * 0.24, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // right: wildcard slice — glitchy, varied
    const rx = w * 0.61;
    const rw = w * 0.33;
    panel(ctx, rx, ly, rw, lh, 1.4 * u, hexA(C.purple, 0.6));
    text(ctx, '🃏 WILDCARD · /wildcard', rx + 1.8 * u, ly + 3.6 * u, { size: 1.6 * u, family: 'mono', color: C.purple, track: 0.25 * u });
    const palettes = [
      [C.purple, C.teal],
      [C.amber, C.red],
      [C.teal, C.green],
    ];
    for (let i = 0; i < 3; i++) {
      const p = easeOutBack(seg(t, 1 + i * 0.12, 1.6 + i * 0.12));
      if (p <= 0) continue;
      const x = rx + 1.8 * u;
      const tw = rw - 3.6 * u;
      const y = ly + 5.4 * u + i * (gh + 1.4 * u);
      const glitch = noise(Math.floor(t * 8) + i * 31) > 0.82 ? (noise(Math.floor(t * 8) + i) - 0.5) * 2.4 * u : 0;
      ctx.save();
      ctx.globalAlpha = clamp01(p);
      ctx.translate(glitch, 0);
      roundRect(ctx, x, y, tw, gh, 0.8 * u);
      const g = ctx.createLinearGradient(x, y, x + tw, y + gh);
      g.addColorStop(0, hexA(palettes[i][0], 0.75));
      g.addColorStop(1, hexA(palettes[i][1], 0.55));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.clip();
      // radically different composition per tile
      ctx.fillStyle = 'rgba(10,10,10,0.55)';
      if (i === 0) {
        for (let k = 0; k < 7; k++) {
          ctx.beginPath();
          ctx.arc(x + tw * noise(k + 3), y + gh * noise(k + 9), (0.6 + noise(k) * 1.8) * u + Math.sin(t * 2 + k) * 0.3 * u, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (i === 1) {
        for (let k = 0; k < 9; k++) ctx.fillRect(x + (k / 9) * tw, y + gh * (0.5 + 0.35 * Math.sin(t * 1.5 + k)), tw / 12, gh);
      } else {
        ctx.save();
        ctx.translate(x + tw / 2, y + gh / 2);
        ctx.rotate(t * 0.4);
        ctx.fillRect(-gh * 0.3, -gh * 0.3, gh * 0.6, gh * 0.6);
        ctx.restore();
      }
      text(ctx, ['SERIF REBEL', 'BRUTAL GRID', 'CHROMA SPIN'][i], x + 1 * u, y + gh - 1.2 * u, { size: 1.5 * u, family: 'mono', weight: 700, color: C.paper });
      ctx.restore();
    }

    const batch = 14 + Math.floor(t / Math.max(8, d / 4));
    text(ctx, `BATCH ${batch} · 15 VARIANTS · 12 STANDARD / 3 WILDCARD`, w / 2, h * 0.92, { size: 1.7 * u, family: 'mono', color: C.sec, align: 'center', track: 0.3 * u });
    drawHudChrome(ctx, w, h, t, 'SCENE 04 // WILDCARD SPLIT');
  },
};
