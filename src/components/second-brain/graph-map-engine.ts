// Canvas renderer for the Second Brain 2D map: ~700 nodes / ~2.4k wikilinks with d3-zoom pan/zoom,
// animated layout morphs, search/selection highlighting and collision-aware labels. Redraws on demand.
import * as d3 from 'd3';
import { rgba, type GraphModel } from './graph-model';
import { labelText, nodeRadius2D, polar, type CircleLayout, type HexLayout, type Layout2D, type MapMode, type RingsLayout } from './graph-layout';

export interface MapLayouts {
  rings: RingsLayout;
  circle: CircleLayout;
  hex: HexLayout;
  force: Layout2D | null;
}

export interface MapEngineCallbacks {
  onHover: (index: number) => void;
  onClick: (index: number) => void;
  onZoom: (k: number) => void;
}

export interface MapEngine {
  setMode: (mode: MapMode) => void;
  setForce: (layout: Layout2D) => void;
  setHighlight: (matches: Set<string> | null, selectedId: string | null) => void;
  /** Screen pixels covered by the inspector drawers; the selected note is panned into the visible gap. */
  setInsets: (left: number, right: number) => void;
  fit: (animate: boolean) => void;
  /** Zoom in on a note and centre it in the visible gap (deep links). Returns false when it isn't in this graph. */
  focus: (id: string) => boolean;
  destroy: () => void;
}

const PULL: Record<MapMode, number> = { circle: 0.15, rings: 0.82, force: 1, hex: 1 };
const FONT = '"JetBrains Mono", ui-monospace, monospace';
const DOTO = '"Doto", "JetBrains Mono", monospace';
const INK = '#0A0A0A';
const PAPER = '#F5F2EB';
const SECONDARY = '#A39E93';
const MUTED = '#6E6A61';
const ORANGE = '#FF5500';
const BG_MODES: MapMode[] = ['rings', 'circle', 'hex'];
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function createMapEngine(
  canvas: HTMLCanvasElement,
  model: GraphModel,
  layouts: MapLayouts,
  initialMode: MapMode,
  cb: MapEngineCallbacks,
): MapEngine {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const { nodes, edges, clusters, vaults, adj, maxDegree } = model;
  const n = nodes.length;
  const radius = new Float32Array(n);
  for (let i = 0; i < n; i++) radius[i] = nodeRadius2D(nodes[i].degree, maxDegree);
  const drawOrder = nodes.map((_, i) => i).sort((a, b) => nodes[a].degree - nodes[b].degree);
  const byRank = nodes.map((_, i) => i).sort((a, b) => nodes[a].rank - nodes[b].rank);

  // Edges grouped by vault colour (wikilinks never cross vaults).
  const vaultIdx = new Map(vaults.map((v, i) => [v.name, i]));
  const edgeGroups: number[][] = vaults.map(() => []);
  edges.forEach((e, k) => edgeGroups[vaultIdx.get(nodes[e.s].vault) ?? 0]?.push(k));

  let mode: MapMode = layouts[initialMode] ? initialMode : 'rings';
  let pending: MapMode | null = layouts[initialMode] ? null : initialMode;
  const cur = new Float32Array((layouts[mode] as Layout2D).pts);
  let from: Float32Array = cur.slice();
  let to: Float32Array = cur;
  let animT0 = -1;
  const ANIM_MS = 850;
  let pull = PULL[mode];
  let pullFrom = pull;
  const bgAlpha: Record<MapMode, number> = { rings: 0, circle: 0, hex: 0, force: 0 };
  bgAlpha[mode] = 1;

  let transform = d3.zoomIdentity;
  let w = 1;
  let h = 1;
  let dpr = 1;
  let hover = -1;
  let selected = -1;
  let matchMask: Uint8Array | null = null;
  let insetL = 0;
  let insetR = 0;
  let raf = 0;
  const widthCache = new Map<string, number>();

  // Static hex cells per cluster.
  const hexPaths = clusters.map((c) => {
    const p = new Path2D();
    const s = layouts.hex.hex - 1.2;
    for (const i of c.nodes) {
      const x = layouts.hex.pts[i * 2];
      const y = layouts.hex.pts[i * 2 + 1];
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        const px = x + Math.cos(a) * s;
        const py = y + Math.sin(a) * s;
        if (k === 0) p.moveTo(px, py);
        else p.lineTo(px, py);
      }
      p.closePath();
    }
    return p;
  });

  const request = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const zoom = d3
    .zoom<HTMLCanvasElement, unknown>()
    .scaleExtent([0.15, 9])
    .on('zoom', (e: d3.D3ZoomEvent<HTMLCanvasElement, unknown>) => {
      transform = e.transform;
      cb.onZoom(transform.k);
      request();
    });
  const sel = d3.select(canvas);
  sel.call(zoom).on('dblclick.zoom', null);

  function measure(text: string, font: string) {
    const key = `${font}|${text}`;
    let v = widthCache.get(key);
    if (v === undefined) {
      ctx!.font = font;
      v = ctx!.measureText(text).width;
      widthCache.set(key, v);
    }
    return v;
  }

  function annulus(r0: number, r1: number, a0: number, a1: number) {
    ctx!.beginPath();
    ctx!.arc(0, 0, r1, a0 - Math.PI / 2, a1 - Math.PI / 2);
    ctx!.arc(0, 0, r0, a1 - Math.PI / 2, a0 - Math.PI / 2, true);
    ctx!.closePath();
  }

  /** Text running along the radius at angle `a`, starting at radius r0, kept upright. */
  function radialText(text: string, r0: number, a: number, font: string, color: string) {
    const c = ctx!;
    const p = polar(r0, a);
    c.save();
    c.translate(p.x, p.y);
    const theta = a - Math.PI / 2;
    const flip = Math.cos(theta) < 0;
    c.rotate(flip ? theta + Math.PI : theta);
    c.font = font;
    c.textAlign = flip ? 'right' : 'left';
    c.textBaseline = 'middle';
    c.fillStyle = color;
    c.fillText(text, 0, 0);
    c.restore();
  }

  function drawRingsBg(k: number) {
    const c = ctx!;
    const L = layouts.rings;
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 92);
    g.addColorStop(0, 'rgba(255,85,0,0.20)');
    g.addColorStop(0.6, 'rgba(255,85,0,0.05)');
    g.addColorStop(1, 'rgba(255,85,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 92, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 1 / k;
    c.strokeStyle = 'rgba(255,255,255,0.07)';
    c.beginPath();
    c.arc(0, 0, L.notesIn - 7, 0, Math.PI * 2);
    c.stroke();

    // Spokes vault hub → folder arcs
    c.setLineDash([2, 4]);
    for (const hub of L.hubs) {
      const v = vaults[hub.vault];
      c.strokeStyle = rgba(v.color, 0.28);
      c.beginPath();
      for (const s of L.sectors) {
        if (clusters[s.cluster].vault !== v.name) continue;
        const p = polar(L.bandIn, (s.start + s.end) / 2);
        const dx = p.x - hub.x;
        const dy = p.y - hub.y;
        const d = Math.hypot(dx, dy) || 1;
        c.moveTo(hub.x + (dx / d) * hub.r, hub.y + (dy / d) * hub.r);
        c.lineTo(p.x, p.y);
      }
      c.stroke();
    }
    c.setLineDash([]);

    // Folder band
    for (const s of L.sectors) {
      const cl = clusters[s.cluster];
      annulus(L.bandIn, L.bandOut, s.start, s.end);
      c.fillStyle = rgba(cl.color, 0.07);
      c.fill();
      c.strokeStyle = rgba(cl.color, 0.4);
      c.stroke();
      annulus(L.bandOut - 3.5, L.bandOut, s.start, s.end);
      c.fillStyle = rgba(cl.color, 0.85);
      c.fill();
    }
    // Folder labels: inside the band when they fit, otherwise radial beyond the notes.
    const mid = (L.bandIn + L.bandOut) / 2;
    for (const s of L.sectors) {
      const cl = clusters[s.cluster];
      const label = labelText(cl.folder, cl.vault);
      const a = (s.start + s.end) / 2;
      const f1 = `600 8px ${FONT}`;
      const tw = measure(label, f1);
      if ((s.end - s.start) * mid > tw + 12) {
        const p = polar(mid, a);
        c.font = f1;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = cl.color;
        c.fillText(label, p.x, p.y - 5);
        c.font = `7px ${FONT}`;
        c.fillStyle = MUTED;
        c.fillText(`${cl.total.toLocaleString('en-US')} notes`, p.x, p.y + 6);
      } else {
        radialText(`${label} · ${cl.total.toLocaleString('en-US')}`, s.outerR + 8, a, `600 7.5px ${FONT}`, cl.color);
      }
    }

    // Vault hubs at the centre
    for (const hub of L.hubs) {
      const v = vaults[hub.vault];
      c.beginPath();
      c.arc(hub.x, hub.y, hub.r + 5, 0, Math.PI * 2);
      c.fillStyle = rgba(v.color, 0.06);
      c.fill();
      c.beginPath();
      c.arc(hub.x, hub.y, hub.r, 0, Math.PI * 2);
      c.fillStyle = rgba(v.color, 0.16);
      c.fill();
      c.lineWidth = 1.5 / Math.max(k, 0.6);
      c.strokeStyle = rgba(v.color, 0.8);
      c.stroke();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `700 ${Math.min(10, hub.r * 0.6)}px ${DOTO}`;
      c.fillStyle = PAPER;
      c.fillText(v.total.toLocaleString('en-US'), hub.x, hub.y);
      // Name outward from the centre so neighbouring hubs don't collide.
      const d = Math.hypot(hub.x, hub.y);
      const dx = d > 1 ? hub.x / d : 0;
      const dy = d > 1 ? hub.y / d : 1;
      const lx = hub.x + dx * (hub.r + 5);
      const ly = hub.y + dy * (hub.r + 5);
      c.textAlign = Math.abs(dx) < 0.35 ? 'center' : dx > 0 ? 'left' : 'right';
      c.textBaseline = Math.abs(dy) < 0.35 ? 'middle' : dy > 0 ? 'top' : 'bottom';
      c.font = `600 8.5px ${FONT}`;
      c.fillStyle = v.color;
      c.fillText(v.name.toUpperCase(), lx, ly);
    }
  }

  function drawCircleBg(k: number) {
    const c = ctx!;
    const L = layouts.circle;
    c.lineWidth = 1 / k;
    c.strokeStyle = 'rgba(58,56,52,0.6)';
    c.beginPath();
    c.arc(0, 0, L.radius, 0, Math.PI * 2);
    c.stroke();
    for (const a of L.arcs) {
      const cl = clusters[a.cluster];
      annulus(L.radius + 12, L.radius + 17, a.start, a.end);
      c.fillStyle = rgba(cl.color, 0.85);
      c.fill();
      const label = labelText(cl.folder, cl.vault);
      const f = `600 8.5px ${FONT}`;
      const tw = measure(label, f);
      const am = (a.start + a.end) / 2;
      if ((a.end - a.start) * (L.radius + 32) > tw + 14) {
        const p = polar(L.radius + 32, am);
        c.font = f;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = cl.color;
        c.fillText(label, p.x, p.y);
      } else {
        radialText(label, L.radius + 24, am, `600 7.5px ${FONT}`, cl.color);
      }
    }
  }

  function drawHexBg(k: number) {
    const c = ctx!;
    c.lineWidth = 1 / k;
    clusters.forEach((cl, i) => {
      c.fillStyle = rgba(cl.color, 0.08);
      c.fill(hexPaths[i]);
      c.strokeStyle = rgba(cl.color, 0.35);
      c.stroke(hexPaths[i]);
    });
  }

  function focusIndex() {
    return hover >= 0 ? hover : selected;
  }

  function draw() {
    const c = ctx!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    const k = transform.k;
    c.setTransform(dpr * k, 0, 0, dpr * k, dpr * transform.x, dpr * transform.y);
    for (const m of BG_MODES) {
      if (bgAlpha[m] < 0.01) continue;
      c.globalAlpha = bgAlpha[m];
      if (m === 'rings') drawRingsBg(k);
      else if (m === 'circle') drawCircleBg(k);
      else drawHexBg(k);
    }
    c.globalAlpha = 1;

    const focus = focusIndex();
    let neighbor: Uint8Array | null = null;
    if (focus >= 0) {
      neighbor = new Uint8Array(n);
      neighbor[focus] = 1;
      for (const j of adj[focus]) neighbor[j] = 1;
    }

    // ── Edges ──
    c.lineCap = 'round';
    const cls = new Uint8Array(edges.length); // 0 dim · 1 normal · 2 focus
    for (let e = 0; e < edges.length; e++) {
      const { s, t } = edges[e];
      if (focus >= 0) cls[e] = s === focus || t === focus ? 2 : 0;
      else if (matchMask) cls[e] = matchMask[s] || matchMask[t] ? 1 : 0;
      else cls[e] = 1;
    }
    const alphaFor = (k2: number) => (focus >= 0 ? [0.04, 0.14, 0.95][k2] : matchMask ? [0.025, 0.55, 0.55][k2] : [0.14, 0.14, 0.14][k2]);
    for (let gI = 0; gI < edgeGroups.length; gI++) {
      const color = vaults[gI].color;
      for (let k2 = 0; k2 < 3; k2++) {
        c.beginPath();
        let any = false;
        for (const e of edgeGroups[gI]) {
          if (cls[e] !== k2) continue;
          const { s, t } = edges[e];
          const ax = cur[s * 2];
          const ay = cur[s * 2 + 1];
          const bx = cur[t * 2];
          const by = cur[t * 2 + 1];
          c.moveTo(ax, ay);
          c.quadraticCurveTo(((ax + bx) / 2) * pull, ((ay + by) / 2) * pull, bx, by);
          any = true;
        }
        if (!any) continue;
        c.strokeStyle = rgba(k2 === 2 && focus >= 0 ? nodes[focus].color : color, alphaFor(k2));
        c.lineWidth = (k2 === 2 ? 1.6 : 0.7) / k;
        c.stroke();
      }
    }

    // ── Nodes ── (the selection/hover and their neighbours stay visible even when they miss the search)
    const alphaOf = (i: number) =>
      i === selected || i === hover ? 1 : matchMask ? (matchMask[i] ? 1 : neighbor?.[i] ? 0.7 : 0.12) : neighbor ? (neighbor[i] ? 1 : 0.35) : 1;
    for (const i of drawOrder) {
      const a = alphaOf(i);
      c.globalAlpha = a * (nodes[i].rank < 40 ? 0.16 : 0.07);
      c.fillStyle = nodes[i].color;
      c.beginPath();
      c.arc(cur[i * 2], cur[i * 2 + 1], radius[i] * 2.2, 0, Math.PI * 2);
      c.fill();
    }
    c.lineWidth = 1 / Math.max(k, 0.8);
    c.strokeStyle = INK;
    for (const i of drawOrder) {
      c.globalAlpha = alphaOf(i);
      c.fillStyle = nodes[i].color;
      c.beginPath();
      c.arc(cur[i * 2], cur[i * 2 + 1], radius[i], 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    c.globalAlpha = 1;
    // Halos: search hits (orange), hover (paper, soft), selection (paper)
    c.lineWidth = 1.5 / Math.max(k, 0.7);
    if (matchMask) {
      c.strokeStyle = rgba(ORANGE, 0.85);
      c.beginPath();
      for (let i = 0; i < n; i++) {
        if (!matchMask[i]) continue;
        c.moveTo(cur[i * 2] + radius[i] + 4, cur[i * 2 + 1]);
        c.arc(cur[i * 2], cur[i * 2 + 1], radius[i] + 4, 0, Math.PI * 2);
      }
      c.stroke();
    }
    if (hover >= 0 && hover !== selected) {
      c.strokeStyle = rgba(PAPER, 0.55);
      c.beginPath();
      c.arc(cur[hover * 2], cur[hover * 2 + 1], radius[hover] + 4, 0, Math.PI * 2);
      c.stroke();
    }
    if (selected >= 0) {
      c.strokeStyle = rgba(PAPER, 0.95);
      c.lineWidth = 2 / Math.max(k, 0.7);
      c.beginPath();
      c.arc(cur[selected * 2], cur[selected * 2 + 1], radius[selected] + 5, 0, Math.PI * 2);
      c.stroke();
    }

    // ── Labels (screen space) ──
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLabels(k, focus, neighbor);
  }

  function drawLabels(k: number, focus: number, neighbor: Uint8Array | null) {
    const c = ctx!;
    const budget = k < 0.5 ? 6 : k < 0.75 ? 12 : k < 1.1 ? 24 : k < 1.6 ? 55 : k < 2.4 ? 130 : k < 3.5 ? 280 : n;
    const seen = new Uint8Array(n);
    const list: { i: number; strong: boolean; dim: boolean }[] = [];
    const push = (i: number, strong: boolean, dim = false) => {
      if (i < 0 || seen[i]) return;
      seen[i] = 1;
      list.push({ i, strong, dim });
    };
    push(selected, true);
    push(hover, true);
    if (focus >= 0) {
      [...adj[focus]].sort((a, b) => nodes[b].degree - nodes[a].degree).slice(0, 30).forEach((i) => push(i, false));
    }
    if (matchMask) {
      let cnt = 0;
      for (const i of byRank) {
        if (!matchMask[i]) continue;
        push(i, false);
        if (++cnt >= 80) break;
      }
    } else {
      for (let r = 0; r < Math.min(budget, n); r++) push(byRank[r], false, !!neighbor && !neighbor[byRank[r]]);
    }
    const boxes: number[] = [];
    c.lineJoin = 'round';
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    for (const { i, strong, dim } of list) {
      const sx = transform.applyX(cur[i * 2]);
      const sy = transform.applyY(cur[i * 2 + 1]);
      if (sx < -200 || sy < -20 || sx > w + 20 || sy > h + 20) continue;
      const hub = nodes[i].rank < 14;
      const font = strong || hub ? `600 10.5px ${FONT}` : `9.5px ${FONT}`;
      const text = trunc(nodes[i].label, strong ? 48 : 34);
      const tw = measure(text, font);
      const x = sx + radius[i] * k + 5;
      const x0 = x - 2;
      const x1 = x + tw + 2;
      const y0 = sy - 7;
      const y1 = sy + 7;
      if (!strong) {
        let hit = false;
        for (let b = 0; b < boxes.length; b += 4) {
          if (x0 < boxes[b + 2] && x1 > boxes[b] && y0 < boxes[b + 3] && y1 > boxes[b + 1]) {
            hit = true;
            break;
          }
        }
        if (hit) continue;
      }
      boxes.push(x0, y0, x1, y1);
      c.font = font;
      c.globalAlpha = dim ? 0.45 : 1;
      c.lineWidth = 3;
      c.strokeStyle = INK;
      c.strokeText(text, x, sy);
      c.fillStyle = strong || hub ? PAPER : SECONDARY;
      c.fillText(text, x, sy);
    }
    c.globalAlpha = 1;
  }

  function frame(now: number) {
    raf = 0;
    let more = false;
    if (animT0 >= 0) {
      const el = now - animT0;
      let done = true;
      for (let i = 0; i < n; i++) {
        const t = (el - (i % 12) * 12) / ANIM_MS;
        if (t < 1) done = false;
        const e = ease(clamp01(t));
        cur[i * 2] = from[i * 2] + (to[i * 2] - from[i * 2]) * e;
        cur[i * 2 + 1] = from[i * 2 + 1] + (to[i * 2 + 1] - from[i * 2 + 1]) * e;
      }
      pull = pullFrom + (PULL[mode] - pullFrom) * ease(clamp01(el / ANIM_MS));
      if (done) {
        animT0 = -1;
        cur.set(to);
        pull = PULL[mode];
      } else more = true;
    }
    for (const m of BG_MODES) {
      const target = m === mode ? 1 : 0;
      const d = target - bgAlpha[m];
      if (Math.abs(d) > 0.004) {
        bgAlpha[m] += d * 0.14;
        more = true;
      } else bgAlpha[m] = target;
    }
    draw();
    if (more) request();
  }

  /** Whole-layout scale; centred on the canvas, or (focusSelection) on the selected note inside the inspector gap. */
  function fitTransform(focusSelection = false) {
    const L = layouts[mode] as Layout2D;
    const k = Math.min(w, h) / (L.extent * 2 + 40);
    const gapL = insetL + 24;
    const gapR = w - insetR - 24;
    if (focusSelection && selected >= 0 && (insetL || insetR) && gapR - gapL >= 120) {
      return d3.zoomIdentity.translate((gapL + gapR) / 2 - k * L.pts[selected * 2], h / 2 - k * L.pts[selected * 2 + 1]).scale(k);
    }
    return d3.zoomIdentity.translate(w / 2, h / 2 + 10).scale(k);
  }

  function fit(animate: boolean, focusSelection = false) {
    sel.interrupt();
    const t = fitTransform(focusSelection);
    if (animate) sel.transition().duration(650).ease(d3.easeCubicInOut).call(zoom.transform, t);
    else sel.call(zoom.transform, t);
  }

  function goTo(m: MapMode) {
    const L = layouts[m];
    if (!L) {
      pending = m;
      return;
    }
    pending = null;
    from = cur.slice();
    to = L.pts;
    pullFrom = pull;
    mode = m;
    animT0 = performance.now();
    fit(true, true);
    request();
  }

  /** Pan (keeping the zoom) so the selected note sits in the visible gap between the inspector drawers. */
  function revealSelected() {
    if (selected < 0 || (!insetL && !insetR)) return;
    const gapL = insetL + 24;
    const gapR = w - insetR - 24;
    if (gapR - gapL < 120) return;
    const tx = animT0 >= 0 ? to[selected * 2] : cur[selected * 2];
    const ty = animT0 >= 0 ? to[selected * 2 + 1] : cur[selected * 2 + 1];
    const sx = transform.applyX(tx);
    const sy = transform.applyY(ty);
    // Labels draw to the right of the node: keep room for one before the right drawer (when the gap allows).
    const labelRoom = gapR - gapL > 360 ? 170 : 0;
    if (sx >= gapL && sx <= gapR - labelRoom && sy >= 40 && sy <= h - 40) return;
    sel.interrupt();
    sel.transition().duration(550).ease(d3.easeCubicInOut).call(zoom.translateTo, tx, ty, [(gapL + gapR) / 2, h / 2]);
  }

  /** Centre note `i` in the visible gap at ≥ 2.2× the fit zoom (never zooming out from a closer view). */
  function focusIndexAt(i: number) {
    const L = layouts[mode] as Layout2D;
    const gapL = insetL + 24;
    const gapR = w - insetR - 24;
    const cx = gapR - gapL >= 120 ? (gapL + gapR) / 2 : w / 2;
    const fitK = Math.min(w, h) / (L.extent * 2 + 40);
    const k = Math.min(9, Math.max(transform.k, fitK * 2.2));
    // Mid-morph: aim at where the note lands, not where it is now.
    const tx = animT0 >= 0 ? to[i * 2] : cur[i * 2];
    const ty = animT0 >= 0 ? to[i * 2 + 1] : cur[i * 2 + 1];
    sel.interrupt();
    sel
      .transition()
      .duration(750)
      .ease(d3.easeCubicInOut)
      .call(zoom.transform, d3.zoomIdentity.translate(cx - k * tx, h / 2 - k * ty).scale(k));
  }

  // ── Pointer ──
  const pick = (mx: number, my: number) => {
    const [wx, wy] = transform.invert([mx, my]);
    const slack = 4 / transform.k;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = cur[i * 2] - wx;
      const dy = cur[i * 2 + 1] - wy;
      const d2 = dx * dx + dy * dy;
      const rr = radius[i] + slack;
      if (d2 < rr * rr && d2 < bestD) {
        bestD = d2;
        best = i;
      }
    }
    return best;
  };
  const onMove = (e: PointerEvent) => {
    if (e.buttons) return;
    const rect = canvas.getBoundingClientRect();
    const i = pick(e.clientX - rect.left, e.clientY - rect.top);
    if (i !== hover) {
      hover = i;
      canvas.style.cursor = i >= 0 ? 'pointer' : 'grab';
      cb.onHover(i);
      request();
    }
  };
  const onLeave = () => {
    if (hover !== -1) {
      hover = -1;
      canvas.style.cursor = 'grab';
      cb.onHover(-1);
      request();
    }
  };
  const onClick = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const i = pick(e.clientX - rect.left, e.clientY - rect.top);
    if (i >= 0) cb.onClick(i);
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);
  canvas.style.cursor = 'grab';

  // ── Size ──
  const host = canvas.parentElement ?? canvas;
  let lastW = 0;
  let lastH = 0;
  const resize = () => {
    w = Math.max(1, host.clientWidth);
    h = Math.max(1, host.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    if (Math.abs(w - lastW) > 2 || Math.abs(h - lastH) > 2) {
      lastW = w;
      lastH = h;
      fit(false);
    }
    request();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  return {
    setMode: (m) => {
      if (m === mode && !pending) return;
      goTo(m);
    },
    setForce: (layout) => {
      layouts.force = layout;
      // Re-animate when Force is already showing too (a newer layout replaces an older one).
      if (pending === 'force' || mode === 'force') goTo('force');
    },
    setHighlight: (matches, selectedId) => {
      if (matches) {
        matchMask = new Uint8Array(n);
        for (const id of matches) {
          const nd = model.byId.get(id);
          if (nd) matchMask[nd.index] = 1;
        }
      } else matchMask = null;
      const prev = selected;
      selected = selectedId ? (model.byId.get(selectedId)?.index ?? -1) : -1;
      if (selected !== prev) revealSelected();
      request();
    },
    setInsets: (left, right) => {
      if (left === insetL && right === insetR) return;
      insetL = left;
      insetR = right;
      revealSelected();
    },
    fit: (animate) => fit(animate),
    focus: (id) => {
      const i = model.byId.get(id)?.index ?? -1;
      if (i < 0) return false;
      focusIndexAt(i);
      return true;
    },
    destroy: () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      sel.interrupt();
      sel.on('.zoom', null);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick);
    },
  };
}
