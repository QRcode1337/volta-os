import 'server-only';
import type { NleClip, NleSequence } from '@/types/nle';
import { FONT_STACK, clipEnd, cssFilter, fittedSize, previousAdjacent, sequenceDuration, trackClips, TEXT_ANIM_SEC } from '@/lib/nle/model';
import { resolveAsset, type NleAsset } from './assets';
import { validateSequence } from './projects';
import { TEXT_LINE_HEIGHT, TEXT_PAD_X_EM, TEXT_PAD_Y_EM, TEXT_RADIUS_EM } from './text';

// NleSequence → a standalone HyperFrames composition (index.html). Attribute contract per hyperframes-core:
// data-start / data-duration on every timed element, data-media-start + data-playback-rate on media, ids on every
// media element, class="clip" on visual clips, data-has-audio / muted on video, data-volume + data-automation volume
// lanes for fades. Geometry is inline CSS; animation is one paused GSAP timeline on window.__timelines.main.
//
// Lossy: dip transitions wash the whole frame (a full-frame colour clip) rather than only the clip; typewriter
// becomes a fade; a held outgoing clip keeps playing source (no last-frame freeze when the source runs out);
// sendcmd-exact easing curves become GSAP eases (dissolve/slides: power1.inOut ≈ smoothstep; pop: back.out).

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (x: number) => String(Math.round(x * 1000) / 1000);
const sel = (id: string) => JSON.stringify(`#${id}`);

export async function sequenceToHyperframes(raw: unknown): Promise<{ html: string; fileName: string }> {
  const s: NleSequence = validateSequence(raw);
  const W = s.width;
  const H = s.height;
  const D = sequenceDuration(s);
  const assets = new Map<string, NleAsset>();
  for (const c of s.clips) {
    if (c.assetId && !assets.has(c.assetId) && c.kind !== 'text' && c.kind !== 'color') assets.set(c.assetId, await resolveAsset(c.assetId));
  }
  const nextOf = new Map<string, NleClip>();
  for (const c of s.clips) {
    if (c.kind === 'audio' || !c.transitionIn || c.transitionIn.duration <= 0) continue;
    const prev = previousAdjacent(s, c);
    if (prev) nextOf.set(prev.id, c);
  }
  const trackIndex = new Map(s.tracks.map((t, i) => [t.id, i]));
  const body: string[] = [];
  const tl: string[] = [];
  const notes: string[] = [];
  const wrapperOf = new Map<string, string>();
  let z = 1;
  let k = 0;
  const hid = (c: NleClip, p: string) => `${p}${(c.id.replace(/[^a-zA-Z0-9_-]/g, '') || 'c') + k}`;

  const automation = (c: NleClip, ownDur: number, total: number): string | null => {
    const pts: { t: number; v: number }[] = [];
    if (c.fadeIn > 0) pts.push({ t: 0, v: 0 }, { t: Math.min(c.fadeIn, ownDur), v: 1 });
    else pts.push({ t: 0, v: 1 });
    if (c.fadeOut > 0) pts.push({ t: Math.max(0, ownDur - c.fadeOut), v: 1 }, { t: ownDur, v: 0 });
    else if (total > ownDur) pts.push({ t: Math.max(0, ownDur - 0.01), v: 1 }, { t: ownDur, v: 0 });
    if (total > ownDur) pts.push({ t: total, v: 0 });
    if (pts.length === 1) return null;
    return JSON.stringify({ version: 1, lanes: [{ target: 'volume', points: pts.map((p) => ({ t: Number(n(p.t)), v: p.v })) }] });
  };

  // visual layers, bottom track first (DOM order + z-index = stacking)
  const videoTracks = s.tracks.filter((t) => t.kind === 'video');
  for (let ti = videoTracks.length - 1; ti >= 0; ti--) {
    const track = videoTracks[ti];
    for (const c of trackClips(s, track.id)) {
      if (c.kind === 'audio') continue;
      k++;
      const next = nextOf.get(c.id);
      const hold = next?.transitionIn ? Math.max(0, Math.min(next.start + next.transitionIn.duration, clipEnd(next)) - clipEnd(c)) : 0;
      const total = c.duration + hold;
      const wid = hid(c, 'w');
      const bid = hid(c, 'b');
      const t0 = c.transform;
      const box = c.kind === 'text' || c.kind === 'color' ? { w: W, h: H } : fittedSize({ width: c.width ?? assets.get(c.assetId ?? '')?.width ?? null, height: c.height ?? assets.get(c.assetId ?? '')?.height ?? null, fit: c.fit }, W, H);
      const filter = cssFilter(c.adjust);
      const boxStyle =
        c.kind === 'text'
          ? `position:absolute;left:${n(W / 2 + t0.x * W)}px;top:${n(H / 2 + t0.y * H)}px;`
          : `position:absolute;left:${n(W / 2 + t0.x * W)}px;top:${n(H / 2 + t0.y * H)}px;width:${n(box.w)}px;height:${n(box.h)}px;`;
      let inner = '';
      const tIdx = trackIndex.get(c.trackId) ?? 0;
      if (c.kind === 'video' || c.kind === 'image') {
        const a = assets.get(c.assetId ?? '');
        if (!a) continue;
        const fit = c.fit === 'fill' ? 'fill' : c.fit;
        const style = `width:100%;height:100%;object-fit:${fit};display:block;`;
        if (c.kind === 'video') {
          const audible = c.hasAudio && a.hasAudio && !c.muted && !track.muted && !track.hidden && c.volume > 0;
          const auto = audible ? automation(c, c.duration, total) : null;
          inner =
            `<video id="${hid(c, 'v')}" src="${esc(a.path)}" data-start="${n(c.start)}" data-duration="${n(total)}" data-media-start="${n(c.mediaStart)}"` +
            `${c.rate !== 1 ? ` data-playback-rate="${n(c.rate)}"` : ''} data-track-index="${tIdx}" playsinline` +
            (audible ? ` data-has-audio="true" data-volume="${n(c.volume)}"${auto ? ` data-automation='${auto}'` : ''}` : ' muted') +
            ` style="${style}"></video>`;
        } else {
          inner = `<img id="${hid(c, 'i')}" src="${esc(a.path)}" alt="" style="${style}" />`;
        }
      } else if (c.kind === 'color') {
        inner = `<div style="width:100%;height:100%;background:${esc(c.color ?? '#111111')};"></div>`;
      } else if (c.kind === 'text' && c.text) {
        const t = c.text;
        const st = [
          `font-family:${esc(FONT_STACK[t.font] ?? FONT_STACK.Inter)}`,
          `font-size:${n(t.size)}px`,
          `font-weight:${t.weight}`,
          `font-style:${t.italic ? 'italic' : 'normal'}`,
          `color:${esc(t.color)}`,
          `text-align:${t.align}`,
          `line-height:${TEXT_LINE_HEIGHT}`,
          `letter-spacing:${n(t.letterSpacing)}px`,
          'white-space:pre',
          t.stroke && t.strokeWidth > 0 ? `-webkit-text-stroke:${n(t.strokeWidth * 2)}px ${esc(t.stroke)};paint-order:stroke fill` : '',
          t.background ? `background:${esc(t.background)};padding:${n(t.size * TEXT_PAD_Y_EM)}px ${n(t.size * TEXT_PAD_X_EM)}px;border-radius:${n(t.size * TEXT_RADIUS_EM)}px` : '',
        ]
          .filter(Boolean)
          .join(';');
        inner = `<div id="${hid(c, 't')}" style="${st}">${esc(t.content)}</div>`;
      }
      body.push(
        `      <div id="${wid}" class="clip" data-start="${n(c.start)}" data-duration="${n(total)}" data-track-index="${tIdx}" style="position:absolute;inset:0;z-index:${z++};overflow:visible;${track.hidden ? 'display:none;' : ''}">\n` +
          `        <div id="${bid}" style="${boxStyle}${filter !== 'none' ? `filter:${filter};` : ''}">${inner}</div>\n      </div>`,
      );
      wrapperOf.set(c.id, wid);
      tl.push(`tl.set(${sel(bid)}, { xPercent: -50, yPercent: -50, rotation: ${n(t0.rotation)}, scale: ${n(t0.scale)}, opacity: ${n(t0.opacity)} }, 0);`);
      if (c.transformEnd) {
        const e = c.transformEnd;
        tl.push(`tl.to(${sel(bid)}, { left: ${n(W / 2 + e.x * W)}, top: ${n(H / 2 + e.y * H)}, rotation: ${n(e.rotation)}, scale: ${n(e.scale)}, opacity: ${n(e.opacity)}, duration: ${n(c.duration)}, ease: "none" }, ${n(c.start)});`);
      }
      // text animations (on the wrapper so they compose with the box transform)
      if (c.kind === 'text' && c.text) {
        const d = Math.min(TEXT_ANIM_SEC, c.duration / 3);
        const anim = (a: string, entering: boolean) => {
          const at = entering ? c.start : c.start + c.duration - d;
          const fromTo = (from: string, to: string, ease: string) => tl.push(`tl.fromTo(${sel(wid)}, { ${from} }, { ${to}, duration: ${n(d)}, ease: "${ease}" }, ${n(at)});`);
          if (a === 'fade' || a === 'typewriter') fromTo(entering ? 'opacity: 0' : 'opacity: 1', entering ? 'opacity: 1' : 'opacity: 0', 'power2.out');
          else if (a === 'slide-up') fromTo(entering ? `opacity: 0, y: ${n(0.06 * H)}` : 'opacity: 1, y: 0', entering ? 'opacity: 1, y: 0' : `opacity: 0, y: ${n(-0.06 * H)}`, 'power2.out');
          else if (a === 'pop') fromTo(entering ? 'opacity: 0, scale: 0.6' : 'opacity: 1, scale: 1', entering ? 'opacity: 1, scale: 1' : 'opacity: 0, scale: 0.6', entering ? 'back.out(2)' : 'power2.in');
          if (a === 'typewriter' && entering) notes.push(`${c.name}: typewriter exported as a fade`);
        };
        anim(c.text.animIn, true);
        anim(c.text.animOut, false);
      }
      // transition: incoming side on this clip, outgoing side on the previous adjacent clip's wrapper
      const tr = c.transitionIn;
      if (tr && tr.duration > 0) {
        const d = tr.duration;
        const prev = previousAdjacent(s, c);
        const prevW = prev ? wrapperOf.get(prev.id) : undefined;
        const outSel = prevW ? sel(prevW) : null;
        const ft = (target: string, from: string, to: string, at = c.start, dur = d, ease = 'power1.inOut') => tl.push(`tl.fromTo(${target}, { ${from} }, { ${to}, duration: ${n(dur)}, ease: "${ease}" }, ${n(at)});`);
        switch (tr.type) {
          case 'dissolve':
            ft(sel(wid), 'opacity: 0', 'opacity: 1');
            break;
          case 'slide-left':
          case 'slide-right':
          case 'slide-up':
          case 'slide-down': {
            const axis = tr.type === 'slide-left' || tr.type === 'slide-right' ? 'x' : 'y';
            const size = axis === 'x' ? W : H;
            const sign = tr.type === 'slide-left' || tr.type === 'slide-up' ? 1 : -1;
            ft(sel(wid), `${axis}: ${n(sign * size)}`, `${axis}: 0`);
            if (outSel) ft(outSel, `${axis}: 0`, `${axis}: ${n(-sign * size)}`);
            break;
          }
          case 'zoom-in':
            ft(sel(wid), 'opacity: 0, scale: 0.6', 'opacity: 1, scale: 1');
            if (outSel) ft(outSel, 'scale: 1', 'scale: 1.25');
            break;
          case 'wipe-left':
            ft(sel(wid), 'clipPath: "inset(0% 0% 0% 100%)"', 'clipPath: "inset(0% 0% 0% 0%)"');
            break;
          case 'wipe-right':
            ft(sel(wid), 'clipPath: "inset(0% 100% 0% 0%)"', 'clipPath: "inset(0% 0% 0% 0%)"');
            break;
          case 'dip-black':
          case 'dip-white': {
            const col = tr.type === 'dip-black' ? '#000000' : '#FFFFFF';
            const washId = hid(c, 'dip');
            body.push(`      <div id="${washId}" class="clip" data-start="${n(c.start)}" data-duration="${n(d)}" style="position:absolute;inset:0;background:${col};opacity:0;z-index:${z++};"></div>`);
            tl.push(`tl.set(${sel(wid)}, { opacity: 0 }, ${n(c.start)}).set(${sel(wid)}, { opacity: 1 }, ${n(c.start + d / 2)});`);
            ft(sel(washId), 'opacity: 0', 'opacity: 1', c.start, d / 2, 'none');
            ft(sel(washId), 'opacity: 1', 'opacity: 0', c.start + d / 2, d / 2, 'none');
            notes.push(`${c.name}: ${tr.type} washes the full frame`);
            break;
          }
        }
      }
    }
  }

  // audio clips
  for (const c of s.clips) {
    if (c.kind !== 'audio') continue;
    const track = s.tracks.find((t) => t.id === c.trackId);
    const a = assets.get(c.assetId ?? '');
    if (!a || !track) continue;
    k++;
    const silent = track.muted || c.muted || c.volume <= 0;
    const auto = silent ? null : automation(c, c.duration, c.duration);
    body.push(
      `      <audio id="${hid(c, 'a')}" src="${esc(a.path)}" data-start="${n(c.start)}" data-duration="${n(c.duration)}" data-media-start="${n(c.mediaStart)}"` +
        `${c.rate !== 1 ? ` data-playback-rate="${n(c.rate)}"` : ''} data-track-index="${trackIndex.get(c.trackId) ?? 0}" data-volume="${silent ? 0 : n(c.volume)}"${auto ? ` data-automation='${auto}'` : ''}></audio>`,
    );
  }

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>${esc(s.name)}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      html, body { margin: 0; background: ${esc(s.background)}; }
      #root { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; background: ${esc(s.background)}; }
      .clip { position: absolute; inset: 0; }
    </style>
  </head>
  <body>
    <!-- Exported from the VOLTA Editor (Edit mode), sequence ${esc(s.id)}. Media src are absolute local file paths. -->
    <!-- Lossy vs the Edit-mode preview: ${esc(['dip transitions wash the full frame', 'typewriter text becomes a fade', 'held outgoing clips keep playing source instead of freezing on the last frame', 'easing curves are GSAP approximations', ...notes].join('; '))}. -->
    <div id="root" data-composition-id="main" data-start="0" data-width="${W}" data-height="${H}" data-duration="${n(D)}" data-fps="${s.fps}">
${body.join('\n')}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      ${tl.join('\n      ')}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
  const fileName = `${(s.name || 'sequence').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'sequence'}.html`;
  return { html, fileName };
}
