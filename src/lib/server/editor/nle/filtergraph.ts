import 'server-only';
import type { NleClip, NleSequence } from '@/types/nle';
import { EPS, TEXT_ANIM_SEC, clamp, clipEnd, fittedSize, previousAdjacent, sequenceDuration, textAnimAt, trackClips, transformAt, transitionAt, transitionFx, type Layer } from '@/lib/nle/model';
import type { NleAsset } from './assets';
import { ffColor, parseColor, renderText, type TextRaster } from './text';

// NleSequence → one ffmpeg filter_complex that reproduces src/lib/nle/model.ts (layersAt / transitionFx /
// transformAt / textAnimAt / gainAt / fittedSize / cssFilter).
//
// Per visual clip ("layer"), bottom track first, later clips over earlier ones within a track:
//   source  → timing (setpts to sequence time, fps grid, tpad clone for held frames)
//           → content at its final pixel size (scale per fit × transform.scale) → rgba → CSS colour filters → blur
//           → geometry: STATIC path (scale/rotation constant: rotate once, overlay x/y as per-frame expressions)
//                       or PERSPECTIVE path (scale or rotation animates: `perspective` maps the content's corners into
//                       frame space every frame — fixed-size frames, which overlay requires)
//           → colorchannelmixer@L for opacity (alpha gain) + dip wash (rgb mix), driven per frame by sendcmd with
//             values sampled straight from model.ts
//           → geq alpha mask for wipes (frame-space edge) — only inside the transition window
//           → overlay enabled on [start, end + transition hold).
// A clip that is the outgoing side of the next clip's transition keeps playing for that transition's duration
// (more source if there is any, else its last frame via tpad).

// ── expression DSL: every node evaluates numerically (self-check against model.ts) and prints as an ffmpeg expr ──

interface Ex {
  /** Set when the expression is constant. */
  c?: number;
  n: (t: number) => number;
  s: (v: string) => string;
}
const fmt = (x: number): string => {
  const r = Math.abs(x) < 1e-9 ? 0 : Number(x.toFixed(6));
  return r < 0 ? `(${r})` : String(r);
};
const K = (c: number): Ex => ({ c, n: () => c, s: () => fmt(c) });
const TV: Ex = { n: (t) => t, s: (v) => v };
const isK = (e: Ex, v?: number): boolean => e.c !== undefined && (v === undefined || Math.abs(e.c - v) < 1e-12);
const add = (a: Ex, b: Ex): Ex =>
  isK(a) && isK(b) ? K(a.c! + b.c!) : isK(a, 0) ? b : isK(b, 0) ? a : { n: (t) => a.n(t) + b.n(t), s: (v) => `(${a.s(v)}+${b.s(v)})` };
const sub = (a: Ex, b: Ex): Ex => (isK(a) && isK(b) ? K(a.c! - b.c!) : isK(b, 0) ? a : { n: (t) => a.n(t) - b.n(t), s: (v) => `(${a.s(v)}-${b.s(v)})` });
const mul = (a: Ex, b: Ex): Ex =>
  isK(a) && isK(b)
    ? K(a.c! * b.c!)
    : isK(a, 0) || isK(b, 0)
      ? K(0)
      : isK(a, 1)
        ? b
        : isK(b, 1)
          ? a
          : { n: (t) => a.n(t) * b.n(t), s: (v) => `(${a.s(v)}*${b.s(v)})` };
const div = (a: Ex, d: number): Ex => mul(a, K(1 / d));
const clipE = (x: Ex, lo: number, hi: number): Ex => (isK(x) ? K(clamp(x.c!, lo, hi)) : { n: (t) => clamp(x.n(t), lo, hi), s: (v) => `clip(${x.s(v)},${fmt(lo)},${fmt(hi)})` });
const iff = (cond: Ex, a: Ex, b: Ex): Ex =>
  isK(cond) ? (cond.c ? a : b) : isK(a) && isK(b) && a.c === b.c ? a : { n: (t) => (cond.n(t) ? a.n(t) : b.n(t)), s: (v) => `if(${cond.s(v)},${a.s(v)},${b.s(v)})` };
const lt = (a: Ex, b: Ex): Ex => (isK(a) && isK(b) ? K(a.c! < b.c! ? 1 : 0) : { n: (t) => (a.n(t) < b.n(t) ? 1 : 0), s: (v) => `lt(${a.s(v)},${b.s(v)})` });
const gte = (a: Ex, b: Ex): Ex => (isK(a) && isK(b) ? K(a.c! >= b.c! ? 1 : 0) : { n: (t) => (a.n(t) >= b.n(t) ? 1 : 0), s: (v) => `gte(${a.s(v)},${b.s(v)})` });
const fn1 = (name: string, f: (x: number) => number) => (a: Ex): Ex => (isK(a) ? K(f(a.c!)) : { n: (t) => f(a.n(t)), s: (v) => `${name}(${a.s(v)})` });
const cosE = fn1('cos', Math.cos);
const sinE = fn1('sin', Math.sin);
const floorE = fn1('floor', Math.floor);
const lerpE = (a: number, b: number, p: Ex): Ex => (a === b ? K(a) : add(K(a), mul(K(b - a), p)));
const smoothE = (p: Ex): Ex => mul(mul(p, p), sub(K(3), mul(K(2), p)));
const easeOutE = (p: Ex): Ex => sub(K(1), mul(sub(K(1), p), sub(K(1), p)));

// ── request → plan ───────────────────────────────────────────────────────────────────────────────

export interface GraphInputs {
  seq: NleSequence;
  /** Output height (null = sequence height). */
  height: number | null;
  fps: number | null;
  assets: Map<string, NleAsset>;
}

export interface GraphPlan {
  W: number;
  H: number;
  fps: number;
  duration: number;
  /** ffmpeg input args, in input-index order (each ends with `-i <file>`). */
  inputs: string[][];
  /** filter_complex text (outputs [vout] and [aout]). */
  graph: string;
  /** Files the graph references by name (sendcmd scripts), to be written into `workDir` before running. */
  sideFiles: { name: string; content: string }[];
  /** Approximations / skipped items worth showing in the job log. */
  notes: string[];
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")}'`;

interface LayerCtx {
  c: NleClip;
  /** The clip whose transitionIn holds `c` as its outgoing layer. */
  next: NleClip | null;
  winStart: number;
  winEnd: number;
}

/** model.ts Layer for clip `c` at time t (what layersAt would hand the preview). */
function modelLayer(l: LayerCtx, t: number): Layer {
  const { c, next } = l;
  if (next?.transitionIn && t >= next.start - 1e-9 && t >= clipEnd(c) - 0.5 / 1000) {
    return { clip: c, outgoing: true, p: clamp((t - next.start) / next.transitionIn.duration, 0, 1), transition: next.transitionIn };
  }
  const x = transitionAt(c, t);
  return x ? { clip: c, outgoing: false, p: x.p, transition: c.transitionIn } : { clip: c, outgoing: false, p: null, transition: null };
}

/** Transition geometry (dx, dy, scale, reveal) as expressions, mirroring transitionFx. */
function fxGeom(type: string, incoming: boolean, p: Ex): { dx: Ex; dy: Ex; scale: Ex; reveal: [Ex, Ex] | null } {
  const e = smoothE(p);
  const one = K(1);
  const zero = K(0);
  const r = { dx: zero, dy: zero, scale: one, reveal: null as [Ex, Ex] | null };
  switch (type) {
    case 'slide-left':
      return { ...r, dx: incoming ? sub(one, e) : mul(K(-1), e) };
    case 'slide-right':
      return { ...r, dx: incoming ? mul(K(-1), sub(one, e)) : e };
    case 'slide-up':
      return { ...r, dy: incoming ? sub(one, e) : mul(K(-1), e) };
    case 'slide-down':
      return { ...r, dy: incoming ? mul(K(-1), sub(one, e)) : e };
    case 'zoom-in':
      return { ...r, scale: incoming ? add(K(0.6), mul(K(0.4), e)) : add(one, mul(K(0.25), e)) };
    case 'wipe-left':
      return incoming ? { ...r, reveal: [sub(one, e), one] } : r;
    case 'wipe-right':
      return incoming ? { ...r, reveal: [zero, e] } : r;
    default:
      return r;
  }
}

/** Text animation geometry (dy, scale) as expressions, mirroring textAnimAt. */
function textGeom(c: NleClip): { dy: Ex; scale: Ex } {
  const text = c.text;
  if (!text || c.kind !== 'text') return { dy: K(0), scale: K(1) };
  const d = Math.min(TEXT_ANIM_SEC, c.duration / 3);
  const local = sub(TV, K(c.start));
  const pin = clipE(div(local, d), 0, 1);
  const pout = clipE(div(sub(K(c.duration), local), d), 0, 1);
  let dy: Ex = K(0);
  let scale: Ex = K(1);
  const apply = (anim: string, p: Ex, entering: boolean) => {
    if (anim === 'pop') {
      const om = sub(K(1), p);
      const wob = sub(K(1), mul(mul(mul(om, om), om), cosE(mul(p, K(Math.PI * 1.5)))));
      scale = mul(scale, add(K(0.6), mul(K(0.4), iff(lt(p, K(1)), wob, K(1)))));
    } else if (anim === 'slide-up') {
      dy = add(dy, mul(K((entering ? 1 : -1) * 0.06), sub(K(1), easeOutE(p))));
    }
  };
  apply(text.animIn, pin, true);
  apply(text.animOut, pout, false);
  return { dy, scale };
}

/** Typewriter reveal fraction (chars / length) while the entering typewriter runs; null when not used. */
function typewriterFrac(c: NleClip): { frac: Ex; until: number } | null {
  const text = c.text;
  if (c.kind !== 'text' || !text || text.animIn !== 'typewriter' || !text.content.length) return null;
  const len = text.content.length;
  const d = Math.min(TEXT_ANIM_SEC, c.duration / 3);
  const span = Math.max(d, Math.min(c.duration * 0.6, len * 0.05));
  const frac = div(floorE(mul(K(len), clipE(div(sub(TV, K(c.start)), span), 0, 1))), len);
  return { frac, until: c.start + span };
}

interface Geometry {
  x: Ex;
  y: Ex;
  s: Ex;
  rot: Ex;
  reveal: { from: Ex; to: Ex; a: number; b: number } | null;
}

function layerGeometry(l: LayerCtx): Geometry {
  const { c, next } = l;
  const a = c.transform;
  const b = c.transformEnd ?? c.transform;
  const pT = c.transformEnd ? clipE(div(sub(TV, K(c.start)), Math.max(EPS, c.duration)), 0, 1) : K(0);
  const tx = lerpE(a.x, b.x, pT);
  const ty = lerpE(a.y, b.y, pT);
  const ts = lerpE(a.scale, b.scale, pT);
  const tr = lerpE(a.rotation, b.rotation, pT);

  const noFx = { dx: K(0), dy: K(0), scale: K(1), reveal: null as [Ex, Ex] | null };
  const dIn = c.transitionIn && c.transitionIn.duration > 0 ? c.transitionIn.duration : 0;
  const fin = dIn ? fxGeom(c.transitionIn!.type, true, clipE(div(sub(TV, K(c.start)), dIn), 0, 1)) : noFx;
  const dOut = next?.transitionIn ? next.transitionIn.duration : 0;
  const fout = next && dOut ? fxGeom(next.transitionIn!.type, false, clipE(div(sub(TV, K(next.start)), dOut), 0, 1)) : noFx;
  const inWin = dIn ? lt(TV, K(c.start + dIn)) : K(0);
  const outWin = next && dOut ? gte(TV, K(Math.max(next.start, clipEnd(c) - 0.0005) - 1e-9)) : K(0);
  const pick = (field: 'dx' | 'dy' | 'scale', none: number) => iff(outWin, fout[field], iff(inWin, fin[field], K(none)));
  const tg = textGeom(c);
  return {
    x: add(tx, pick('dx', 0)),
    y: add(add(ty, pick('dy', 0)), tg.dy),
    s: mul(mul(ts, pick('scale', 1)), tg.scale),
    rot: tr,
    reveal: fin.reveal ? { from: fin.reveal[0], to: fin.reveal[1], a: c.start, b: c.start + dIn } : null,
  };
}

/** Compare the expression geometry with model.ts at a few times; returns a note when they disagree. */
function selfCheck(l: LayerCtx, g: Geometry): string | null {
  const ts = [0, 0.13, 0.37, 0.5, 0.71, 0.93].map((f) => l.winStart + f * (l.winEnd - l.winStart));
  for (const t of ts) {
    const layer = modelLayer(l, t);
    const fx = transitionFx(layer);
    const tf = transformAt(l.c, t);
    const ta = textAnimAt(l.c, t);
    const want = { x: tf.x + fx.dx, y: tf.y + fx.dy + ta.dy, s: tf.scale * fx.scale * ta.scale, rot: tf.rotation };
    const got = { x: g.x.n(t), y: g.y.n(t), s: g.s.n(t), rot: g.rot.n(t) };
    for (const k of Object.keys(want) as (keyof typeof want)[]) {
      if (Math.abs(want[k] - got[k]) > 1e-6) return `self-check: clip "${l.c.name}" ${k} differs from preview at t=${t.toFixed(3)} (${got[k].toFixed(4)} vs ${want[k].toFixed(4)})`;
    }
  }
  return null;
}

// ── colour filters (CSS filter semantics on 8-bit sRGB rgba) ─────────────────────────────────────

function cssFilterChain(adj: NleClip['adjust']): string[] {
  const out: string[] = [];
  const bri = 1 + (adj?.brightness ?? 0);
  const con = adj?.contrast ?? 1;
  const sat = adj?.saturation ?? 1;
  if (Math.abs(bri - 1) > 1e-4) out.push(`colorchannelmixer=rr=${fmt(clamp(bri, 0, 2))}:gg=${fmt(clamp(bri, 0, 2))}:bb=${fmt(clamp(bri, 0, 2))}`);
  if (Math.abs(con - 1) > 1e-4) {
    const f = `clip((val-128)*${fmt(con)}+128,0,255)`;
    out.push(`lutrgb=r='${f}':g='${f}':b='${f}'`);
  }
  if (Math.abs(sat - 1) > 1e-4) {
    // CSS saturate() matrix; split into equal stages so every coefficient stays inside colorchannelmixer's ±2
    const stages = sat > 2.2 ? 2 : 1;
    const s = Math.pow(Math.max(0, sat), 1 / stages);
    const m = [
      [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
      [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
      [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
    ];
    const ccm = `colorchannelmixer=rr=${fmt(m[0][0])}:rg=${fmt(m[0][1])}:rb=${fmt(m[0][2])}:gr=${fmt(m[1][0])}:gg=${fmt(m[1][1])}:gb=${fmt(m[1][2])}:br=${fmt(m[2][0])}:bg=${fmt(m[2][1])}:bb=${fmt(m[2][2])}`;
    for (let i = 0; i < stages; i++) out.push(ccm);
  }
  return out;
}

// ── builder ──────────────────────────────────────────────────────────────────────────────────────

export async function buildExportGraph(opts: GraphInputs): Promise<GraphPlan> {
  const { seq, assets } = opts;
  const H = even(opts.height ?? seq.height);
  const W = opts.height ? even((H * seq.width) / seq.height) : even(seq.width);
  const fps = opts.fps ?? seq.fps;
  const pxr = H / seq.height; // output px per sequence px (text size, blur, stroke)
  const D = sequenceDuration(seq);
  const frame = 1 / fps;
  const snap = (t: number) => Math.round(t * fps) / fps;

  const inputs: string[][] = [];
  const chains: string[] = [];
  const sideFiles: { name: string; content: string }[] = [];
  const notes: string[] = [];
  const addInput = (args: string[]) => inputs.push(args) - 1;

  chains.push(`color=c=${ffColor(seq.background, '#000000').replace(/@.*$/, '')}:s=${W}x${H}:r=${fps}:d=${fmt(D)},format=yuv420p[base0]`);
  let base = 'base0';
  let li = 0;

  const assetOf = (c: NleClip): NleAsset => {
    const a = c.assetId ? assets.get(c.assetId) : undefined;
    if (!a) throw new Error(`Clip "${c.name}" has no resolved media.`);
    return a;
  };

  // which clip holds each clip as its outgoing transition layer
  const nextOf = new Map<string, NleClip>();
  for (const n of seq.clips) {
    if (n.kind === 'audio' || !n.transitionIn || n.transitionIn.duration <= 0) continue;
    const prev = previousAdjacent(seq, n);
    if (prev && prev.kind !== 'audio') nextOf.set(prev.id, n);
  }

  const videoTracks = seq.tracks.filter((t) => t.kind === 'video' && !t.hidden);
  for (let ti = videoTracks.length - 1; ti >= 0; ti--) {
    for (const c of trackClips(seq, videoTracks[ti].id)) {
      if (c.kind === 'audio') continue;
      const next = nextOf.get(c.id) ?? null;
      const holdEnd = next?.transitionIn ? Math.min(next.start + next.transitionIn.duration, clipEnd(next)) : 0;
      const l: LayerCtx = { c, next, winStart: c.start, winEnd: Math.max(clipEnd(c), holdEnd) };
      const win = l.winEnd - l.winStart;
      if (win <= frame / 4) continue;
      const g = layerGeometry(l);
      const chk = selfCheck(l, g);
      if (chk) notes.push(chk);

      // per-frame samples straight from model.ts: opacity (transform × transition × text) and dip wash
      const T0 = snap(l.winStart);
      const nFrames = Math.max(1, Math.ceil((l.winEnd - T0) / frame - 1e-6));
      const samples: { t: number; alpha: number; wash: { color: string; alpha: number } | null }[] = [];
      for (let i = 0; i < nFrames; i++) {
        const t = T0 + i * frame;
        const tt = Math.max(t, l.winStart);
        const fx = transitionFx(modelLayer(l, tt));
        const alpha = clamp(transformAt(c, tt).opacity * fx.opacity * textAnimAt(c, tt).opacity, 0, 1);
        samples.push({ t, alpha, wash: fx.wash && fx.wash.alpha > 0 ? fx.wash : null });
      }
      if (samples.every((s) => s.alpha <= 0.001)) continue;
      const alphaVaries = samples.some((s) => Math.abs(s.alpha - samples[0].alpha) > 1e-4);
      const washVaries = samples.some((s) => !!s.wash);
      const tw = typewriterFrac(c);

      // geometry path
      let sStatic = isK(g.s) && isK(g.rot);
      let sMax = 0;
      for (let i = 0; i <= 24; i++) sMax = Math.max(sMax, Math.abs(g.s.n(l.winStart + (i / 24) * win)));
      if (sMax <= 1e-4) continue;

      // base box (output px at scale 1) and content source
      let bw: number;
      let bh: number;
      let text1: TextRaster | null = null;
      if (c.kind === 'text') {
        if (!c.text) continue;
        text1 = await renderText(c.text, pxr);
        bw = text1.w;
        bh = text1.h;
      } else if (c.kind === 'color') {
        ({ w: bw, h: bh } = fittedSize({ width: null, height: null, fit: c.fit }, W, H));
      } else {
        const a = assetOf(c);
        ({ w: bw, h: bh } = fittedSize({ width: c.width ?? a.width, height: c.height ?? a.height, fit: c.fit }, W, H));
      }
      if (sStatic && (bw * g.s.c! > 4 * W || bh * g.s.c! > 4 * H)) sStatic = false; // huge: perspective path caps it
      const sRef = sStatic ? g.s.c! : Math.max(0.05, Math.min(sMax, (2 * W) / bw, (2 * H) / bh));
      let cw = Math.max(1, Math.round(bw * sRef));
      let ch = Math.max(1, Math.round(bh * sRef));
      let textR: TextRaster | null = null;
      if (c.kind === 'text') {
        textR = Math.abs(sRef - 1) < 1e-3 ? text1 : await renderText(c.text!, pxr * sRef);
        cw = textR!.w;
        ch = textR!.h;
      }
      const needFrames = c.kind === 'video' || !sStatic || alphaVaries || washVaries || !!tw || !!g.reveal;

      // 1. source + timing
      const L = `L${li++}`;
      const parts: string[] = [];
      let src: string;
      if (c.kind === 'video') {
        const a = assetOf(c);
        const rate = clamp(c.rate || 1, 0.0625, 16);
        const ms = Math.max(0, c.mediaStart || 0);
        const srcDur = a.durationSec ?? c.sourceDuration ?? null;
        const need = (l.winEnd - c.start) * rate;
        const avail = srcDur == null ? Infinity : Math.max(0, srcDur - ms);
        const take = Math.min(need + 4 * frame * rate, avail === Infinity ? need + 1 : avail + 1);
        const idx = addInput([...(ms > 0 ? ['-ss', fmt(ms)] : []), '-t', fmt(Math.max(take, frame)), '-i', a.path]);
        src = `[${idx}:v:0]`;
        parts.push(`setpts=(PTS-STARTPTS)/${fmt(rate)}+${fmt(c.start)}/TB`, `fps=${fps}:start_time=${fmt(T0)}`);
        const deficit = (need - avail) / rate;
        if (deficit > -2 * frame) parts.push(`tpad=stop_mode=clone:stop_duration=${fmt(Math.max(0, deficit) + 2 * frame)}`);
      } else if (c.kind === 'image') {
        src = `[${addInput(['-i', assetOf(c).path])}:v:0]`;
        parts.push('trim=end_frame=1');
      } else if (c.kind === 'text') {
        src = `[${addInput(['-i', textR!.file])}:v:0]`;
        parts.push('trim=end_frame=1');
      } else {
        src = '';
        parts.push(`color=c=${ffColor(c.color, '#111111')}:s=${cw}x${ch}:r=${fps}:d=${fmt(frame)}`, 'trim=end_frame=1');
      }

      // 2. content at its pixel size + CSS colour filters + blur
      if (c.kind !== 'text' && c.kind !== 'color') parts.push(`scale=${cw}:${ch}:flags=bicubic`, 'setsar=1');
      parts.push('format=rgba');
      if (c.kind !== 'color' || (c.adjust && (c.adjust.brightness || c.adjust.contrast !== 1 || c.adjust.saturation !== 1))) parts.push(...cssFilterChain(c.adjust));
      const sigma = Math.max(0, (c.adjust?.blur ?? 0) * pxr * sRef);
      let padB = 0;
      if (sigma > 0.3) {
        padB = Math.ceil(sigma * 3);
        parts.push(`pad=${cw + 2 * padB}:${ch + 2 * padB}:${padB}:${padB}:color=black@0`, `gblur=sigma=${fmt(sigma)}`);
      }
      const bwPx = cw + 2 * padB;
      const bhPx = ch + 2 * padB;

      // stills: one processed frame, then cloned on the output frame grid only when something animates per frame
      if (c.kind !== 'video') {
        parts.push(`setpts=PTS-STARTPTS+${fmt(T0)}/TB`);
        if (needFrames) parts.push(`fps=${fps}:start_time=${fmt(T0)}`, `tpad=stop_mode=clone:stop_duration=${fmt(l.winEnd - T0 + frame)}`);
      }

      // 3. typewriter: horizontal reveal of the text block (content space)
      if (tw && textR) {
        const scaleK = 1; // text is rasterised at its content size
        const edge = add(K((textR.bx + padB) * scaleK), mul(K(textR.bw * scaleK), tw.frac));
        parts.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*lt(X,${edge.s('T')})':enable='lt(t,${fmt(tw.until)})'`);
        notes.push(`"${c.name}": typewriter approximated as a left-to-right reveal of the whole text block (stepped per character).`);
      }

      // 4. geometry
      let ox: Ex = K(0);
      let oy: Ex = K(0);
      if (sStatic) {
        const r0 = g.rot.c!;
        let rw = bwPx;
        let rh = bhPx;
        if (Math.abs(r0 % 360) > 1e-3) {
          const rad = (r0 * Math.PI) / 180;
          rw = Math.ceil(Math.abs(bwPx * Math.cos(rad)) + Math.abs(bhPx * Math.sin(rad)));
          rh = Math.ceil(Math.abs(bwPx * Math.sin(rad)) + Math.abs(bhPx * Math.cos(rad)));
          parts.push(`rotate=a=${fmt(rad)}:ow=${rw}:oh=${rh}:c=none`);
        }
        ox = sub(add(K(W / 2), mul(g.x, K(W))), K(rw / 2));
        oy = sub(add(K(H / 2), mul(g.y, K(H))), K(rh / 2));
      } else {
        const CW = even(Math.max(W, bwPx));
        const CH = even(Math.max(H, bhPx));
        const px = Math.floor((CW - bwPx) / 2);
        const py = Math.floor((CH - bhPx) / 2);
        const ccx = px + bwPx / 2;
        const ccy = py + bhPx / 2;
        const offX = Math.floor((CW - W) / 2);
        const offY = Math.floor((CH - H) / 2);
        const k = div(g.s, sRef);
        const rad = mul(g.rot, K(Math.PI / 180));
        const cs = cosE(rad);
        const sn = sinE(rad);
        const cx = add(K(offX + W / 2), mul(g.x, K(W)));
        const cy = add(K(offY + H / 2), mul(g.y, K(H)));
        const tvar = `(${fmt(T0)}+in/${fps})`;
        const corner = (X0: number, Y0: number) => {
          const u = K(X0 - ccx);
          const v = K(Y0 - ccy);
          const X = add(cx, mul(k, sub(mul(u, cs), mul(v, sn))));
          const Y = add(cy, mul(k, add(mul(u, sn), mul(v, cs))));
          return [X.s(tvar), Y.s(tvar)];
        };
        const [x0, y0] = corner(0, 0);
        const [x1, y1] = corner(CW, 0);
        const [x2, y2] = corner(0, CH);
        const [x3, y3] = corner(CW, CH);
        if (CW !== bwPx || CH !== bhPx) parts.push(`pad=${CW}:${CH}:${px}:${py}:color=black@0`);
        parts.push(`perspective=x0='${x0}':y0='${y0}':x1='${x1}':y1='${y1}':x2='${x2}':y2='${y2}':x3='${x3}':y3='${y3}':sense=destination:eval=frame`);
        if (CW !== W || CH !== H) parts.push(`crop=${W}:${H}:${offX}:${offY}`);
      }

      // 5. opacity + dip wash: colorchannelmixer@L, per-frame values via sendcmd
      const mixer = `colorchannelmixer@${L}`;
      const valuesAt = (s: (typeof samples)[number]) => {
        const w = s.wash ? clamp(s.wash.alpha, 0, 1) : 0;
        const [wr, wg, wb] = s.wash ? parseColor(s.wash.color) : [0, 0, 0];
        return { aa: s.alpha, rr: 1 - w, gg: 1 - w, bb: 1 - w, ra: w * wr, ga: w * wg, ba: w * wb };
      };
      if (alphaVaries || washVaries) {
        const lines: string[] = [];
        let prev = '';
        for (const s of samples) {
          const v = valuesAt(s);
          const keys = (washVaries ? ['aa', 'rr', 'gg', 'bb', 'ra', 'ga', 'ba'] : ['aa']) as (keyof typeof v)[];
          const cmd = keys.map((k2) => `${mixer} ${k2} ${fmt(v[k2])}`).join(', ');
          if (cmd !== prev) lines.push(`${fmt(Math.max(0, s.t - frame / 2))} ${cmd};`);
          prev = cmd;
        }
        const file = `sendcmd_${L}.txt`;
        sideFiles.push({ name: file, content: lines.join('\n') + '\n' });
        const v0 = valuesAt(samples[0]);
        parts.push(`sendcmd=f=${q(`@WORKDIR@/${file}`)}`, `${mixer}=aa=${fmt(v0.aa)}${washVaries ? `:rr=${fmt(v0.rr)}:gg=${fmt(v0.gg)}:bb=${fmt(v0.bb)}:ra=${fmt(v0.ra)}:ga=${fmt(v0.ga)}:ba=${fmt(v0.ba)}` : ''}`);
      } else if (samples[0].alpha < 0.9999) {
        parts.push(`colorchannelmixer=aa=${fmt(samples[0].alpha)}`);
      }

      // 6. wipe: alpha mask by frame-space x, only during the transition window
      if (g.reveal) {
        const xf = sStatic ? `(X+${ox.s('T')})` : 'X';
        const from = mul(g.reveal.from, K(W)).s('T');
        const to = mul(g.reveal.to, K(W)).s('T');
        parts.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*gte(${xf},${from})*lt(${xf},${to})':enable='lt(t,${fmt(g.reveal.b)})'`);
      }

      chains.push(`${src}${parts.join(',')}[${L}]`);

      // 7. overlay on the running composite
      const xy = isK(ox) && isK(oy) ? `x=${fmt(ox.c!)}:y=${fmt(oy.c!)}` : `x='${ox.s('t')}':y='${oy.s('t')}':eval=frame`;
      const nextBase = `base${li}`;
      chains.push(`[${base}][${L}]overlay=${xy}:enable='gte(t,${fmt(l.winStart - EPS)})*lt(t,${fmt(l.winEnd - EPS)})'[${nextBase}]`);
      base = nextBase;
    }
  }
  chains.push(`[${base}]format=yuv420p[vout]`);

  // ── audio: every audible clip → atrim / atempo / volume / fades / delay → amix ──
  const audioLabels: string[] = [];
  let ai = 0;
  for (const c of seq.clips) {
    const tr = seq.tracks.find((t) => t.id === c.trackId);
    // a video clip's sound plays only inside its own [start, end) (never while held under a transition), and not at
    // all when its video track is hidden; muted tracks / clips are silent
    if (!tr || tr.muted || c.muted || c.volume <= 0) continue;
    if (c.kind === 'video' && tr.hidden) continue;
    if (c.kind !== 'audio' && !(c.kind === 'video' && c.hasAudio)) continue;
    const a = assetOf(c);
    if (!a.hasAudio) {
      notes.push(`"${c.name}": source has no audio stream; skipped in the mix.`);
      continue;
    }
    const rate = clamp(c.rate || 1, 0.25, 4);
    const ms = Math.max(0, c.mediaStart || 0);
    const srcLen = c.duration * rate;
    const idx = addInput([...(ms > 0 ? ['-ss', fmt(ms)] : []), '-t', fmt(srcLen + 0.05), '-i', a.path]);
    const f: string[] = [`atrim=0:${fmt(srcLen)}`, 'asetpts=PTS-STARTPTS'];
    let r = rate;
    while (r > 2 + 1e-9) {
      f.push('atempo=2');
      r /= 2;
    }
    while (r < 0.5 - 1e-9) {
      f.push('atempo=0.5');
      r /= 0.5;
    }
    if (Math.abs(r - 1) > 1e-4) f.push(`atempo=${fmt(r)}`);
    f.push('aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo');
    if (Math.abs(c.volume - 1) > 1e-4) f.push(`volume=${fmt(clamp(c.volume, 0, 2))}`);
    if (c.fadeIn > 0) f.push(`afade=t=in:st=0:d=${fmt(c.fadeIn)}:curve=tri`);
    if (c.fadeOut > 0) f.push(`afade=t=out:st=${fmt(Math.max(0, c.duration - c.fadeOut))}:d=${fmt(c.fadeOut)}:curve=tri`);
    const delay = Math.round(c.start * 48000);
    if (delay > 0) f.push(`adelay=delays=${delay}S:all=1`);
    const lab = `a${ai++}`;
    chains.push(`[${idx}:a:0]${f.join(',')}[${lab}]`);
    audioLabels.push(lab);
  }
  if (audioLabels.length === 0) {
    chains.push(`anullsrc=r=48000:cl=stereo,atrim=0:${fmt(D)}[aout]`);
  } else {
    const mix = audioLabels.length === 1 ? `[${audioLabels[0]}]anull` : `${audioLabels.map((x) => `[${x}]`).join('')}amix=inputs=${audioLabels.length}:normalize=0:dropout_transition=0:duration=longest`;
    chains.push(`${mix},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad=whole_dur=${fmt(D)},atrim=0:${fmt(D)}[aout]`);
  }

  return { W, H, fps, duration: D, inputs, graph: chains.join(';\n'), sideFiles, notes };
}

/** Text clips of a sequence (for pre-flight checks). */
export const textClips = (s: NleSequence) => s.clips.filter((c) => c.kind === 'text' && c.text);
