import { C, type SceneDef, clamp01, drawBackdrop, drawHudChrome, drawMascot, easeOutBack, easeOutCubic, hexA, noise, panel, roundRect, seg, text } from './common';

/** Scene 8 — outro end-screen: watch-next slots, pulsing SUBSCRIBE CTA with cursor click, community card, confetti. */
export const outroCta: SceneDef = {
  key: 'outro-cta',
  label: 'Outro & Subscribe CTA',
  hotspots: [
    { label: 'Subscribe CTA Button', x: 54, y: 36, w: 40, h: 22 },
    { label: 'Community Template Card', x: 54, y: 60, w: 40, h: 28 },
    { label: 'End-Screen Video Slots', x: 4, y: 14, w: 44, h: 74 },
    { label: 'Pixel Mascot', x: 82, y: 8, w: 14, h: 24 },
  ],
  draw(ctx, w, h, t) {
    const u = h / 100;
    drawBackdrop(ctx, w, h, t, { x: 0.74, y: 0.48, strength: 0.22 });

    // watch-next slots
    text(ctx, 'WATCH NEXT', w * 0.06, h * 0.15, { size: 1.8 * u, family: 'mono', color: C.sec, track: 0.5 * u });
    const titles = ['Claude Mods Deep Dive', 'Direct Media Gen Setup'];
    for (let i = 0; i < 2; i++) {
      const p = easeOutCubic(seg(t, 0.3 + i * 0.3, 1.2 + i * 0.3));
      const sx = w * 0.06 - (1 - p) * 10 * u;
      const sy = h * 0.19 + i * 36 * u;
      const sw = w * 0.4;
      const sh = sw * (9 / 16) * 0.6;
      ctx.save();
      ctx.globalAlpha = p;
      panel(ctx, sx, sy, sw, sh, 1.2 * u, i === 0 ? hexA(C.orange, 0.5) : C.border, C.elev);
      ctx.save();
      roundRect(ctx, sx, sy, sw, sh, 1.2 * u);
      ctx.clip();
      for (let k = 0; k < 14; k++) {
        const bx = sx + ((k / 14 + t * 0.03 * (i ? -1 : 1)) % 1) * sw;
        ctx.fillStyle = hexA(i ? C.purple : C.orange, 0.06 + noise(k + i * 20) * 0.1);
        ctx.fillRect(bx, sy, sw / 18, sh);
      }
      ctx.restore();
      // play icon
      ctx.fillStyle = hexA(C.paper, 0.9);
      ctx.beginPath();
      ctx.moveTo(sx + sw / 2 - 1.8 * u, sy + sh / 2 - 2.4 * u);
      ctx.lineTo(sx + sw / 2 + 2.4 * u, sy + sh / 2);
      ctx.lineTo(sx + sw / 2 - 1.8 * u, sy + sh / 2 + 2.4 * u);
      ctx.closePath();
      ctx.fill();
      text(ctx, titles[i], sx, sy + sh + 3.6 * u, { size: 2.4 * u, weight: 600, color: C.paper });
      ctx.restore();
    }

    // mascot
    drawMascot(ctx, w * 0.89, h * 0.19, 9 * u, seg(t, 0.2, 1.8));

    // subscribe button with cursor click at ~3.2s and every 9s afterwards
    const bx = w * 0.56;
    const by = h * 0.39;
    const bw = w * 0.36;
    const bh = 14 * u;
    const clickT = t < 3.2 ? -1 : (t - 3.2) % 9;
    const press = clickT >= 0 && clickT < 0.25 ? 0.94 : 1;
    const subscribed = t >= 3.3;
    const intro = easeOutBack(seg(t, 0.6, 1.6));
    ctx.save();
    ctx.translate(bx + bw / 2, by + bh / 2);
    ctx.scale(intro * press, intro * press);
    ctx.shadowColor = C.orange;
    ctx.shadowBlur = (2 + Math.sin(t * 3) * 1.2) * u;
    roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
    ctx.fillStyle = subscribed ? C.elev : C.orange;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = C.orange;
    ctx.lineWidth = 0.35 * u;
    ctx.stroke();
    text(ctx, subscribed ? '✓ SUBSCRIBED' : 'SUBSCRIBE', 0, 0.4 * u, { size: 4.6 * u, weight: 800, family: 'doto', color: subscribed ? C.orange : C.bg, align: 'center', base: 'middle' });
    ctx.restore();
    // ripple
    if (clickT >= 0 && clickT < 1) {
      ctx.strokeStyle = hexA(C.orange, 1 - clickT);
      ctx.lineWidth = 0.3 * u;
      roundRect(ctx, bx - clickT * 3 * u, by - clickT * 3 * u, bw + clickT * 6 * u, bh + clickT * 6 * u, bh / 2 + clickT * 3 * u);
      ctx.stroke();
    }
    // cursor
    const cursorP = easeOutCubic(seg(t, 1.8, 3.1));
    const curX = bx + bw * 0.72 + (1 - cursorP) * 18 * u;
    const curY = by + bh * 0.6 + (1 - cursorP) * 22 * u;
    if (t > 1.8) {
      ctx.save();
      ctx.translate(curX, curY);
      ctx.fillStyle = C.paper;
      ctx.strokeStyle = C.bg;
      ctx.lineWidth = 0.25 * u;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 4.4 * u);
      ctx.lineTo(1.2 * u, 3.3 * u);
      ctx.lineTo(2.2 * u, 5.4 * u);
      ctx.lineTo(3 * u, 5 * u);
      ctx.lineTo(2 * u, 3 * u);
      ctx.lineTo(3.4 * u, 3 * u);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // community card
    const cp = easeOutCubic(seg(t, 1.2, 2.2));
    ctx.save();
    ctx.globalAlpha = cp;
    const cy = h * 0.62 + (1 - cp) * 6 * u;
    panel(ctx, bx, cy, bw, 24 * u, 1.4 * u);
    text(ctx, 'GRAB THE FULL TEMPLATE', bx + 2 * u, cy + 5 * u, { size: 1.7 * u, family: 'mono', color: C.orange, track: 0.4 * u });
    text(ctx, 'VOLTA Agentic OS', bx + 2 * u, cy + 11.4 * u, { size: 4 * u, weight: 700, color: C.paper });
    text(ctx, 'Free in the community · link in description', bx + 2 * u, cy + 16.4 * u, { size: 2 * u, weight: 500, color: C.sec });
    const dots = Math.floor(t * 3) % 4;
    text(ctx, `DOWNLOADING${'.'.repeat(dots)}`, bx + 2 * u, cy + 21 * u, { size: 1.5 * u, family: 'mono', color: C.muted });
    ctx.restore();

    // confetti after subscribe
    if (subscribed) {
      const since = t - 3.3;
      for (let k = 0; k < 60; k++) {
        const life = (since * (0.25 + noise(k) * 0.2) + noise(k + 99)) % 1;
        const x = bx + bw / 2 + (noise(k * 3) - 0.5) * w * 0.5 + Math.sin(since * 2 + k) * 2 * u;
        const y = by - 10 * u + life * h * 0.75;
        ctx.globalAlpha = clamp01(1 - life) * 0.9;
        ctx.fillStyle = [C.orange, C.amber, C.paper, C.green][k % 4];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(since * 3 + k);
        ctx.fillRect(-0.4 * u, -0.2 * u, 0.8 * u, 0.4 * u);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    drawHudChrome(ctx, w, h, t, 'SCENE 08 // OUTRO CTA');
  },
};
