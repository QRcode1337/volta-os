import { USAGE_SNAPSHOT } from '@/lib/mock-data';
import { C, type SceneDef, clamp01, drawBackdrop, drawHudChrome, easeOutBack, easeOutCubic, hexA, lerp, panel, roundRect, seg, text } from './common';

/** Scene 5 — warm vs cold prompt-cache gauge that flips mid-clip, with cost comparison bars. */
export const cacheMeter: SceneDef = {
  key: 'cache-meter',
  label: 'Prompt Cache Warm/Cold Meter',
  hotspots: [
    { label: 'Cost Comparison Panel', x: 66, y: 22, w: 31, h: 60 },
    { label: 'Warm/Cold Cache Meter', x: 18, y: 26, w: 50, h: 62 },
    { label: 'Context Window Bar', x: 5, y: 86, w: 90, h: 10 },
  ],
  draw(ctx, w, h, t, d) {
    const u = h / 100;
    const c = USAGE_SNAPSHOT.cache;
    const flipAt = d * 0.5;
    const cold = easeOutBack(seg(t, flipAt, flipAt + 1.2));
    const isCold = t >= flipAt;
    const tone = isCold ? C.cyan : C.green;
    drawBackdrop(ctx, w, h, t, { x: 0.44, y: 0.6, color: isCold ? C.cyan : C.green, strength: 0.14 });

    text(ctx, 'PROMPT CACHE MATH', w * 0.06, h * 0.15, { size: 4.4 * u, weight: 700 });
    text(ctx, 'WHY IDLE SESSIONS COST YOU', w * 0.06, h * 0.2, { size: 1.7 * u, family: 'mono', color: C.sec, track: 0.4 * u });

    // gauge
    const gx = w * 0.43;
    const gy = h * 0.7;
    const R = 26 * u;
    const intro = easeOutCubic(seg(t, 0.3, 1.8));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = C.elev;
    ctx.beginPath();
    ctx.arc(gx, gy, R, Math.PI, Math.PI * 2);
    ctx.stroke();
    // warm half and cold half
    ctx.strokeStyle = hexA(C.green, 0.8);
    ctx.beginPath();
    ctx.arc(gx, gy, R, Math.PI, Math.PI + Math.PI * 0.5 * intro);
    ctx.stroke();
    ctx.strokeStyle = hexA(C.cyan, 0.8);
    ctx.beginPath();
    ctx.arc(gx, gy, R, Math.PI * 1.5, Math.PI * 1.5 + Math.PI * 0.5 * intro);
    ctx.stroke();
    // ticks
    ctx.lineWidth = Math.max(1, 0.2 * u);
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI + (i / 20) * Math.PI;
      const r1 = R - 3.4 * u;
      const r2 = R - (i % 5 === 0 ? 5.6 * u : 4.4 * u);
      ctx.strokeStyle = hexA(C.paper, i % 5 === 0 ? 0.5 : 0.2);
      ctx.beginPath();
      ctx.moveTo(gx + Math.cos(a) * r1, gy + Math.sin(a) * r1);
      ctx.lineTo(gx + Math.cos(a) * r2, gy + Math.sin(a) * r2);
      ctx.stroke();
    }
    // needle
    const jitter = Math.sin(t * 7) * 0.012;
    const ang = Math.PI + lerp(0.22, 0.82, cold) * Math.PI * intro + jitter;
    ctx.strokeStyle = C.orange;
    ctx.lineWidth = 0.7 * u;
    ctx.shadowColor = C.orange;
    ctx.shadowBlur = 1.5 * u;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + Math.cos(ang) * (R - 6 * u), gy + Math.sin(ang) * (R - 6 * u));
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.paper;
    ctx.beginPath();
    ctx.arc(gx, gy, 1.4 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    text(ctx, 'WARM', gx - R, gy + 4 * u, { size: 1.6 * u, family: 'mono', color: C.green, align: 'center' });
    text(ctx, 'COLD', gx + R, gy + 4 * u, { size: 1.6 * u, family: 'mono', color: C.cyan, align: 'center' });

    // big readout
    const tokens = isCold ? c.coldTokens : c.cachedTokens;
    text(ctx, `${Math.round(tokens / 1000)}k`, gx, gy - 8 * u, { size: 8 * u, weight: 800, family: 'doto', color: tone, align: 'center' });
    text(ctx, isCold ? 'TOKENS TO RELOAD' : 'TOKENS CACHED', gx, gy - 3.6 * u, { size: 1.6 * u, family: 'mono', color: C.sec, align: 'center', track: 0.3 * u });

    // status chip with countdown
    const minsLeft = Math.max(0, c.warmMinutesLeft - Math.floor((t / Math.max(1, flipAt)) * c.warmMinutesLeft));
    const chip = isCold ? '❄ COLD · FULL RELOAD' : `● WARM · ${String(minsLeft).padStart(2, '0')}:00 LEFT`;
    ctx.save();
    ctx.font = `600 ${1.8 * u}px 'JetBrains Mono', monospace`;
    const cw = ctx.measureText(chip).width + 3 * u;
    roundRect(ctx, gx - cw / 2, h * 0.28, cw, 4.2 * u, 2.1 * u);
    ctx.fillStyle = hexA(tone, 0.14);
    ctx.fill();
    ctx.strokeStyle = hexA(tone, 0.7);
    ctx.stroke();
    ctx.restore();
    text(ctx, chip, gx, h * 0.28 + 2.95 * u, { size: 1.8 * u, family: 'mono', color: tone, align: 'center' });

    // cost comparison panel
    const px = w * 0.68;
    const py = h * 0.24;
    const pw = w * 0.27;
    const ph = h * 0.56;
    panel(ctx, px, py, pw, ph, 1.4 * u);
    text(ctx, 'COST OF NEXT MESSAGE', px + 1.8 * u, py + 3.6 * u, { size: 1.5 * u, family: 'mono', color: C.sec, track: 0.25 * u });
    const rows = [
      { label: 'WARM (CACHED)', v: c.warmNextMsgUsd, col: C.green, on: 1 },
      { label: 'COLD RELOAD · OPUS', v: c.coldReloadUsd, col: C.cyan, on: clamp01(cold) },
    ];
    rows.forEach((r, i) => {
      const ry = py + 8 * u + i * 13 * u;
      text(ctx, r.label, px + 1.8 * u, ry, { size: 1.5 * u, family: 'mono', color: r.col });
      const barW = (pw - 3.6 * u) * (r.v / c.coldReloadUsd) * easeOutCubic(i === 0 ? seg(t, 1, 2.5) : r.on);
      roundRect(ctx, px + 1.8 * u, ry + 1.6 * u, pw - 3.6 * u, 2.4 * u, 1.2 * u);
      ctx.fillStyle = C.elev;
      ctx.fill();
      if (barW > 0.5) {
        roundRect(ctx, px + 1.8 * u, ry + 1.6 * u, Math.max(2.4 * u, barW), 2.4 * u, 1.2 * u);
        ctx.fillStyle = r.col;
        ctx.fill();
      }
      text(ctx, `$${(r.v * (i === 0 ? 1 : clamp01(r.on))).toFixed(2)}`, px + pw - 1.8 * u, ry + 8.2 * u, { size: 4 * u, weight: 800, family: 'doto', color: C.paper, align: 'right' });
    });
    const mult = Math.round(c.coldReloadUsd / c.warmNextMsgUsd);
    text(ctx, `${mult}× MORE EXPENSIVE COLD`, px + pw / 2, py + ph - 2.6 * u, { size: 1.7 * u, family: 'mono', color: C.orange, align: 'center', alpha: clamp01(cold) });

    // context window bar
    const pct = c.contextUsed / c.contextMax;
    const cy = h * 0.9;
    text(ctx, `CONTEXT ${Math.round(c.contextUsed / 1000)}k / ${c.contextMax / 1_000_000}M`, w * 0.06, cy - 1.2 * u, { size: 1.5 * u, family: 'mono', color: C.sec });
    roundRect(ctx, w * 0.06, cy, w * 0.88, 1.6 * u, 0.8 * u);
    ctx.fillStyle = C.elev;
    ctx.fill();
    roundRect(ctx, w * 0.06, cy, w * 0.88 * pct * intro, 1.6 * u, 0.8 * u);
    ctx.fillStyle = C.orange;
    ctx.fill();
    drawHudChrome(ctx, w, h, t, 'SCENE 06 // CACHE METER');
  },
};
