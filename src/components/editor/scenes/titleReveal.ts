import { C, type SceneDef, clamp01, drawBackdrop, drawHudChrome, drawMascot, easeOutBack, easeOutCubic, easeOutExpo, hexA, noise, seg, setFont, spacing, text } from './common';

/** Scene 1 — Claude 5.5 title reveal with Doto lockup, assembling mascot and lower-third. */
export const titleReveal: SceneDef = {
  key: 'title-reveal',
  label: 'Claude 5.5 Title Reveal',
  hotspots: [
    { label: 'Title Lockup', x: 22, y: 34, w: 56, h: 30 },
    { label: 'Pixel Mascot', x: 42, y: 8, w: 16, h: 24 },
    { label: 'Lower-Third Caption', x: 4, y: 64, w: 48, h: 18 },
  ],
  draw(ctx, w, h, t, d, meta) {
    const u = h / 100;
    drawBackdrop(ctx, w, h, t, { x: 0.5, y: 0.45, strength: 0.2 });

    // orbiting particles around the lockup
    ctx.save();
    for (let i = 0; i < 46; i++) {
      const a = noise(i) * Math.PI * 2 + t * (0.08 + noise(i + 50) * 0.12) * (i % 2 ? 1 : -1);
      const r = (24 + noise(i + 9) * 22) * u;
      const x = w / 2 + Math.cos(a) * r * 1.9;
      const y = h * 0.46 + Math.sin(a) * r * 0.55;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + i));
      ctx.fillStyle = hexA(i % 5 === 0 ? C.orange : C.paper, 0.12 + tw * 0.25);
      ctx.fillRect(x, y, 0.35 * u, 0.35 * u);
    }
    ctx.restore();

    // mascot
    drawMascot(ctx, w / 2, h * 0.2, 11 * u, seg(t, 0.1, 1.8));
    const halo = clamp01(seg(t, 1.6, 2.4));
    if (halo > 0) {
      ctx.save();
      ctx.strokeStyle = hexA(C.orange, 0.35 * halo);
      ctx.lineWidth = 0.25 * u;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.2, (8 + Math.sin(t * 2) * 0.6) * u, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Doto lockup with per-glyph stagger
    const line1 = meta?.heading ? 'VOLTA' : 'CLAUDE 5.5';
    const line2 = (meta?.heading ?? 'AGENTIC OS').toUpperCase().slice(0, 26);
    const size1 = 13 * u;
    setFont(ctx, size1, 800, 'doto');
    spacing(ctx, size1 * 0.02);
    const widths = [...line1].map((ch) => ctx.measureText(ch).width + size1 * 0.02);
    const total = widths.reduce((a, b) => a + b, 0);
    let x = w / 2 - total / 2;
    const baseY = h * 0.48;
    [...line1].forEach((ch, i) => {
      const p = easeOutBack(seg(t, 0.6 + i * 0.08, 1.3 + i * 0.08));
      const alpha = clamp01(seg(t, 0.6 + i * 0.08, 1.0 + i * 0.08));
      const flicker = t > 2.5 && noise(Math.floor(t * 9) + i * 13) > 0.985 ? 0.35 : 1;
      text(ctx, ch, x, baseY - (1 - p) * 8 * u, { size: size1, weight: 800, family: 'doto', color: i >= line1.length - 3 && !meta?.heading ? C.orange : C.paper, alpha: alpha * flicker });
      x += widths[i];
    });

    // line 2 wipe reveal
    const wipe = easeOutExpo(seg(t, 1.6, 2.8));
    ctx.save();
    ctx.beginPath();
    ctx.rect(w / 2 - (w * 0.4 * wipe), baseY + 1.5 * u, w * 0.8 * wipe, 12 * u);
    ctx.clip();
    text(ctx, line2, w / 2, baseY + 10 * u, { size: 7.2 * u, weight: 700, color: C.paper, align: 'center', track: 1.4 * u });
    ctx.restore();

    // orange underline sweep + glow
    const sweep = easeOutCubic(seg(t, 2.2, 3.4));
    if (sweep > 0) {
      ctx.save();
      ctx.shadowColor = C.orange;
      ctx.shadowBlur = 2.5 * u;
      ctx.fillStyle = C.orange;
      const lw = 34 * u * sweep;
      ctx.fillRect(w / 2 - lw, baseY + 13.2 * u, lw * 2, 0.55 * u);
      ctx.restore();
    }
    text(ctx, 'VOLTA // LOCAL-FIRST AGENTIC OPERATING SYSTEM', w / 2, baseY + 18.5 * u, {
      size: 1.9 * u,
      family: 'mono',
      color: C.sec,
      align: 'center',
      track: 0.5 * u,
      alpha: seg(t, 3, 3.8),
    });

    // lower-third (bottom-left)
    const lt = easeOutCubic(seg(t, 3.2, 4.2));
    if (lt > 0) {
      const lx = w * 0.06 - (1 - lt) * 20 * u;
      const ly = h * 0.68;
      ctx.save();
      ctx.globalAlpha = lt;
      ctx.fillStyle = 'rgba(20,20,19,0.88)';
      ctx.fillRect(lx, ly, 40 * u * 1.6, 9.5 * u);
      ctx.fillStyle = C.orange;
      ctx.fillRect(lx, ly, 0.8 * u, 9.5 * u);
      text(ctx, 'EPISODE 01 — THE HOOK', lx + 2.6 * u, ly + 3.8 * u, { size: 2 * u, family: 'mono', color: C.orange, track: 0.35 * u });
      const facts = ['Built with Claude 5.5 · 424,846 files', '8 micro-apps · 1 local OS', 'Zero cloud uploads · plain-text ARMS'];
      const fi = Math.floor(t / 6) % facts.length;
      const fa = clamp01(Math.min((t % 6) / 0.4, (6 - (t % 6)) / 0.4));
      text(ctx, facts[fi], lx + 2.6 * u, ly + 7.6 * u, { size: 2.9 * u, weight: 600, color: C.paper, alpha: fa });
      ctx.restore();
    }

    // progress ticker (bottom-right)
    const pr = clamp01(t / Math.max(1, d));
    text(ctx, `${String(Math.round(pr * 100)).padStart(3, '0')}%`, w * 0.94, h * 0.84, { size: 3.4 * u, weight: 700, family: 'doto', color: hexA(C.orange, 0.9), align: 'right' });
    drawHudChrome(ctx, w, h, t, 'SCENE 01 // TITLE HUD');
  },
};
