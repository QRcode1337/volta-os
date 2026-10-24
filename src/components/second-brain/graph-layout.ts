// Layouts for the Second Brain graph. 2D: rings / circle / hex / force (d3-force). 3D: a small
// force simulation with sampled repulsion (fast enough for ~700 nodes / ~2.4k links on the main thread).
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3';
import { prng, type GraphModel } from './graph-model';

export type MapMode = 'force' | 'circle' | 'hex' | 'rings';

/** Node radius in 2D world units (scales with link degree; hubs ≈ 11). */
export function nodeRadius2D(degree: number, maxDegree: number): number {
  return 2.6 + Math.sqrt(Math.max(0, degree) / Math.max(1, maxDegree)) * 8.6;
}

/** Polar → cartesian with 0 rad at 12 o'clock, clockwise (same as d3.arc). */
export const polar = (r: number, a: number) => ({ x: r * Math.sin(a), y: -r * Math.cos(a) });

export interface Layout2D {
  pts: Float32Array; // x0,y0,x1,y1…
  extent: number; // bounding radius incl. decorations
}

export interface RingSector {
  cluster: number;
  start: number;
  end: number;
  outerR: number; // radius of the outermost note row
}

export interface VaultHub {
  vault: number; // index into model.vaults
  x: number;
  y: number;
  r: number;
  start: number; // angular range covered by the vault's folders
  end: number;
}

export interface RingsLayout extends Layout2D {
  sectors: RingSector[];
  hubs: VaultHub[];
  bandIn: number;
  bandOut: number;
  notesIn: number;
}

export interface CircleLayout extends Layout2D {
  radius: number;
  arcs: { cluster: number; start: number; end: number }[];
}

export interface HexLayout extends Layout2D {
  hex: number; // cell radius
}

/** Folder label as drawn on the map (kept in sync with graph-map-engine). */
export const labelText = (folder: string, vault: string) => (folder === '(root)' ? `${vault} root` : folder).toUpperCase();

const RING = { hubRing: 44, bandIn: 102, bandOut: 138, notesIn: 168, nodeGap: 4, rowGap: 4 };

export function ringsLayout(model: GraphModel): RingsLayout {
  const { nodes, clusters, vaults, maxDegree } = model;
  const pts = new Float32Array(nodes.length * 2);
  const radius = nodes.map((n) => nodeRadius2D(n.degree, maxDegree));

  // Angular spans: sub-linear in each folder's node footprint so hubs get room and small folders stay visible.
  const weights = clusters.map((c) => Math.max(Math.pow(c.nodes.reduce((sum, i) => sum + radius[i] * 2 + RING.nodeGap, 0), 0.8), 6.5));
  const vaultGap = vaults.length > 1 ? 0.06 : 0;
  const folderGap = 0.014;
  const avail = Math.PI * 2 - vaultGap * vaults.length - folderGap * Math.max(0, clusters.length - vaults.length);
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;
  const span = weights.map((w) => (w / wSum) * avail);

  const sectors: RingSector[] = [];
  const hubs: VaultHub[] = [];
  // Centre the biggest folder at the bottom so the small folders sit near the top.
  let a = Math.PI - (span[0] ?? 0) / 2;
  vaults.forEach((v, vi) => {
    const vStart = a;
    v.clusters.forEach((ci, j) => {
      if (j > 0) a += folderGap;
      const s = a;
      const e = a + span[ci];
      a = e;
      // Rows: highest degree first, innermost.
      const list = [...clusters[ci].nodes].sort((x, y) => nodes[y].degree - nodes[x].degree || x - y);
      const pad = Math.min(0.03, (e - s) * 0.08);
      const usable = Math.max(0.001, e - s - pad * 2);
      let r = RING.notesIn;
      let k = 0;
      let outer = r;
      while (k < list.length) {
        const row: number[] = [];
        let used = 0;
        const cap = usable * r;
        while (k < list.length) {
          const w = radius[list[k]] * 2 + RING.nodeGap;
          if (row.length && used + w > cap) break;
          row.push(list[k]);
          used += w;
          k++;
        }
        const maxD = Math.max(...row.map((i) => radius[i] * 2));
        const rr = r + maxD / 2;
        const full = k < list.length;
        // Full rows spread across the sector; the last partial row keeps natural spacing, centred.
        const scale = full ? (usable * rr) / used : 1;
        let cursor = s + pad + (full ? 0 : (usable - used / rr) / 2);
        for (const i of row) {
          const w = ((radius[i] * 2 + RING.nodeGap) * scale) / rr;
          const p = polar(rr, cursor + w / 2);
          pts[i * 2] = p.x;
          pts[i * 2 + 1] = p.y;
          cursor += w;
        }
        outer = Math.max(outer, rr + maxD / 2);
        r += maxD + RING.rowGap;
      }
      sectors.push({ cluster: ci, start: s, end: e, outerR: outer });
    });
    hubs.push({ vault: vi, x: 0, y: 0, r: 0, start: vStart, end: a });
    a += vaultGap;
  });

  const maxTotal = Math.max(1, ...vaults.map((v) => v.total));
  hubs.forEach((h) => {
    const v = vaults[h.vault];
    h.r = 10 + Math.sqrt(v.total / maxTotal) * 16;
    if (vaults.length > 1) {
      const p = polar(RING.hubRing, (h.start + h.end) / 2);
      h.x = p.x;
      h.y = p.y;
    }
  });
  // Push overlapping hubs apart while keeping them inside the folder band.
  for (let it = 0; it < 40; it++) {
    let moved = false;
    for (let i = 0; i < hubs.length; i++) {
      for (let j = i + 1; j < hubs.length; j++) {
        const a = hubs[i];
        const b = hubs[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const need = a.r + b.r + 10;
        if (d >= need) continue;
        const push = (need - d) / 2;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
        moved = true;
      }
    }
    for (const h of hubs) {
      const d = Math.hypot(h.x, h.y);
      const lim = RING.bandIn - h.r - 6;
      if (d > lim) {
        h.x *= lim / d;
        h.y *= lim / d;
      }
    }
    if (!moved) break;
  }
  // Radial folder labels ("FOLDER · 1,234", ~4.6 px per mono char) run outward past the last note row.
  const labelLen = (ci: number) => (labelText(clusters[ci].folder, clusters[ci].vault).length + 8) * 4.6;
  const extent = Math.max(RING.bandOut + 40, ...sectors.map((s) => Math.max(s.outerR + 40, s.outerR + 14 + labelLen(s.cluster))));
  return { pts, extent, sectors, hubs, bandIn: RING.bandIn, bandOut: RING.bandOut, notesIn: RING.notesIn };
}

export function circleLayout(model: GraphModel): CircleLayout {
  const { nodes, clusters, maxDegree } = model;
  const R = 360;
  const pts = new Float32Array(nodes.length * 2);
  const order: number[] = [];
  for (const c of clusters) order.push(...[...c.nodes].sort((x, y) => nodes[y].degree - nodes[x].degree || x - y));
  // Angle allocated by node size so hubs get room; a small gap between folders.
  const gap = 0.012;
  const widths = order.map((i) => nodeRadius2D(nodes[i].degree, maxDegree) * 2 + 0.6);
  const total = widths.reduce((s, w) => s + w, 0) || 1;
  const avail = Math.PI * 2 - gap * clusters.length;
  const arcs: CircleLayout['arcs'] = [];
  let a = 0;
  let k = 0;
  for (const c of clusters) {
    const start = a;
    for (let j = 0; j < c.nodes.length; j++, k++) {
      const w = (widths[k] / total) * avail;
      const p = polar(R, a + w / 2);
      pts[order[k] * 2] = p.x;
      pts[order[k] * 2 + 1] = p.y;
      a += w;
    }
    arcs.push({ cluster: c.index, start, end: a });
    a += gap;
  }
  const longest = Math.max(0, ...clusters.map((c) => labelText(c.folder, c.vault).length));
  return { pts, extent: R + 34 + longest * 4.6, radius: R, arcs };
}

export function hexLayout(model: GraphModel): HexLayout {
  const { nodes, clusters } = model;
  const n = nodes.length;
  const pts = new Float32Array(n * 2);
  const hex = Math.min(30, Math.max(9, Math.sqrt((Math.PI * 330 * 330) / (Math.max(1, n) * 2.598))));
  const K = Math.ceil(Math.sqrt(n)) + 3;
  const cells: { x: number; y: number; d: number; a: number }[] = [];
  for (let q = -K; q <= K; q++) {
    for (let r = -K; r <= K; r++) {
      if (Math.abs(q + r) > K) continue;
      const x = hex * Math.sqrt(3) * (q + r / 2);
      const y = hex * 1.5 * r;
      let ang = Math.atan2(x, -y);
      if (ang < 0) ang += Math.PI * 2;
      cells.push({ x, y, d: x * x + y * y, a: ang });
    }
  }
  cells.sort((p, q) => p.d - q.d || p.a - q.a);
  const disk = cells.slice(0, n).sort((p, q) => p.a - q.a || p.d - q.d);
  // Each folder gets a contiguous wedge; inside a wedge the most-linked notes take the innermost cells.
  let off = 0;
  for (const c of clusters) {
    const wedge = disk.slice(off, off + c.nodes.length).sort((p, q) => p.d - q.d);
    const list = [...c.nodes].sort((x, y) => nodes[y].degree - nodes[x].degree || x - y);
    list.forEach((i, j) => {
      pts[i * 2] = wedge[j].x;
      pts[i * 2 + 1] = wedge[j].y;
    });
    off += c.nodes.length;
  }
  const extent = Math.sqrt(disk.reduce((m, c) => Math.max(m, c.d), 0)) + hex + 40;
  return { pts, extent, hex };
}

interface SimN extends SimulationNodeDatum {
  i: number;
  ax: number;
  ay: number;
  r: number;
}

export interface ForceJob {
  /** Advance the simulation; returns true once settled. */
  step: (ticks: number) => boolean;
  result: () => Layout2D;
}

const FORCE_TICKS = 180;

/** d3-force layout, advanced in chunks by the caller so the main thread never blocks for long. */
export function forceLayout2D(model: GraphModel): ForceJob {
  const { nodes, edges, vaults, maxDegree } = model;
  const rnd = prng(5862);
  // Vault anchors: the biggest vault at the centre, the others around it.
  const anchor = new Map<string, { x: number; y: number }>();
  vaults.forEach((v, i) => {
    anchor.set(v.name, i === 0 ? { x: 0, y: 0 } : polar(300, ((i - 1) / Math.max(1, vaults.length - 1)) * Math.PI * 2 + Math.PI * 0.75));
  });
  const sim: SimN[] = nodes.map((n) => {
    const a = anchor.get(n.vault) ?? { x: 0, y: 0 };
    return { i: n.index, ax: a.x, ay: a.y, r: nodeRadius2D(n.degree, maxDegree), x: a.x + (rnd() - 0.5) * 160, y: a.y + (rnd() - 0.5) * 160 };
  });
  const links = edges.map((e) => ({ source: e.s, target: e.t }));
  const s = forceSimulation<SimN>(sim)
    .alphaDecay(1 - Math.pow(0.001, 1 / FORCE_TICKS))
    .force('link', forceLink<SimN, { source: number; target: number }>(links).distance(26))
    .force('charge', forceManyBody<SimN>().strength((d) => -22 - d.r * 4).distanceMax(520).theta(0.95))
    .force('collide', forceCollide<SimN>((d) => d.r + 1.4).iterations(1))
    .force('x', forceX<SimN>((d) => d.ax).strength(0.045))
    .force('y', forceY<SimN>((d) => d.ay).strength(0.045))
    .stop();
  let done = 0;
  return {
    step: (ticks: number) => {
      const t = Math.min(ticks, FORCE_TICKS - done);
      if (t > 0) s.tick(t);
      done += t;
      return done >= FORCE_TICKS;
    },
    result: () => {
      const cx = sim.reduce((m, d) => m + (d.x ?? 0), 0) / Math.max(1, sim.length);
      const cy = sim.reduce((m, d) => m + (d.y ?? 0), 0) / Math.max(1, sim.length);
      const rads = sim.map((d) => Math.hypot((d.x ?? 0) - cx, (d.y ?? 0) - cy)).sort((a, b) => a - b);
      const p98 = rads[Math.floor(rads.length * 0.98)] || 1;
      const k = 340 / p98;
      const pts = new Float32Array(nodes.length * 2);
      let maxR = 0;
      for (const d of sim) {
        let x = ((d.x ?? 0) - cx) * k;
        let y = ((d.y ?? 0) - cy) * k;
        const rr = Math.hypot(x, y);
        if (rr > 420) {
          x *= 420 / rr;
          y *= 420 / rr;
        }
        maxR = Math.max(maxR, Math.min(rr, 420));
        pts[d.i * 2] = x;
        pts[d.i * 2 + 1] = y;
      }
      return { pts, extent: maxR + 40 };
    },
  };
}

// ───────────────────────── 3D orb ─────────────────────────

export interface OrbLayout {
  pos: Float32Array; // x,y,z per node
  centroids: Float32Array; // x,y,z per cluster
  spreads: Float32Array; // RMS radius per cluster
  labelPos: Float32Array; // x,y,z per cluster (just outside compact clusters; densest spot of diffuse ones)
  radius: number; // p95 node distance from origin
}

function fibDir(i: number, count: number): [number, number, number] {
  if (count <= 1) return [0, 1, 0];
  const y = 1 - (i / (count - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const th = i * Math.PI * (3 - Math.sqrt(5));
  return [Math.cos(th) * r, y, Math.sin(th) * r];
}

/**
 * Cluster anchors. The largest vault's folders sit near the core (its notes spread through the orb
 * around their hubs); every other vault's folders orbit as satellites spread over the whole sphere.
 */
function anchors(model: GraphModel): Float32Array {
  const { clusters, vaults } = model;
  const out = new Float32Array(clusters.length * 3);
  const main = vaults[0]?.name;
  const inner = clusters.filter((c) => c.vault === main);
  const outer = clusters.filter((c) => c.vault !== main);
  inner.forEach((c, i) => out.set(fibDir(i, inner.length).map((v) => v * 14), c.index * 3));
  outer.forEach((c, i) => out.set(fibDir(i + 0.5, outer.length + 1).map((v) => v * 50), c.index * 3));
  return out;
}

export function orbLayout(model: GraphModel): OrbLayout {
  const { nodes, edges, clusters, adj, maxDegree, vaults } = model;
  const n = nodes.length;
  const rnd = prng(424846);
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  const A = anchors(model);
  const pos = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  const charge = new Float32Array(n);
  const anchorK = new Float32Array(n);
  const mainVault = vaults[0]?.name;
  for (let i = 0; i < n; i++) {
    const c = nodes[i].cluster;
    pos[i * 3] = A[c * 3] + gauss() * 14;
    pos[i * 3 + 1] = A[c * 3 + 1] + gauss() * 14;
    pos[i * 3 + 2] = A[c * 3 + 2] + gauss() * 14;
    // Hubs repel harder so they spread out and their linked notes gather around them.
    charge[i] = 18 + Math.sqrt(nodes[i].degree / maxDegree) * 260;
    anchorK[i] = nodes[i].vault === mainVault ? 0.035 : 0.08;
  }
  const cnt = adj.map((l) => Math.max(1, l.length));
  const T = 230;
  const K = Math.min(28, Math.max(1, n - 1));
  const scaleRep = n > 1 ? (n - 1) / K : 0;
  const L = 7;
  let alpha = 1;
  for (let tick = 0; tick < T; tick++) {
    alpha *= 0.976;
    // links (d3-style bias toward moving the less-connected end)
    for (const e of edges) {
      const s = e.s * 3;
      const t = e.t * 3;
      const dx = pos[t] - pos[s] + vel[t] - vel[s];
      const dy = pos[t + 1] - pos[s + 1] + vel[t + 1] - vel[s + 1];
      const dz = pos[t + 2] - pos[s + 2] + vel[t + 2] - vel[s + 2];
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-3;
      const strength = 1 / Math.min(cnt[e.s], cnt[e.t]);
      const f = ((l - L) / l) * alpha * strength;
      const b = cnt[e.s] / (cnt[e.s] + cnt[e.t]);
      vel[t] -= dx * f * b;
      vel[t + 1] -= dy * f * b;
      vel[t + 2] -= dz * f * b;
      vel[s] += dx * f * (1 - b);
      vel[s + 1] += dy * f * (1 - b);
      vel[s + 2] += dz * f * (1 - b);
    }
    // sampled many-body repulsion
    for (let i = 0; i < n; i++) {
      const p = i * 3;
      let fx = 0;
      let fy = 0;
      let fz = 0;
      for (let k = 0; k < K; k++) {
        let j = Math.floor(rnd() * n);
        if (j === i) j = (j + 1) % n;
        const q = j * 3;
        const dx = pos[p] - pos[q];
        const dy = pos[p + 1] - pos[q + 1];
        const dz = pos[p + 2] - pos[q + 2];
        const d2 = Math.max(dx * dx + dy * dy + dz * dz, 4);
        if (d2 > 160 * 160) continue;
        const w = charge[j] / d2;
        fx += dx * w;
        fy += dy * w;
        fz += dz * w;
      }
      const s = alpha * scaleRep * 0.06;
      vel[p] += fx * s;
      vel[p + 1] += fy * s;
      vel[p + 2] += fz * s;
      const c = nodes[i].cluster * 3;
      const ak = anchorK[i] * alpha;
      vel[p] += (A[c] - pos[p]) * ak;
      vel[p + 1] += (A[c + 1] - pos[p + 1]) * ak;
      vel[p + 2] += (A[c + 2] - pos[p + 2]) * ak;
    }
    for (let i = 0; i < n * 3; i++) {
      vel[i] *= 0.6;
      pos[i] += vel[i];
    }
  }

  // Centre + normalise so 95% of nodes sit within ~62 units (matches the camera rig).
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    cx += pos[i * 3];
    cy += pos[i * 3 + 1];
    cz += pos[i * 3 + 2];
  }
  cx /= Math.max(1, n);
  cy /= Math.max(1, n);
  cz /= Math.max(1, n);
  const rads: number[] = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] -= cx;
    pos[i * 3 + 1] -= cy;
    pos[i * 3 + 2] -= cz;
    rads.push(Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
  }
  rads.sort((a, b) => a - b);
  const p95 = rads[Math.floor(rads.length * 0.95)] || 1;
  const k = 62 / p95;
  for (let i = 0; i < n * 3; i++) pos[i] *= k;
  for (let i = 0; i < n; i++) {
    const p = i * 3;
    const r = Math.hypot(pos[p], pos[p + 1], pos[p + 2]);
    if (r > 92) {
      pos[p] *= 92 / r;
      pos[p + 1] *= 92 / r;
      pos[p + 2] *= 92 / r;
    }
  }

  const C = clusters.length;
  const centroids = new Float32Array(C * 3);
  const spreads = new Float32Array(C);
  const labelPos = new Float32Array(C * 3);
  for (const c of clusters) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const i of c.nodes) {
      x += pos[i * 3];
      y += pos[i * 3 + 1];
      z += pos[i * 3 + 2];
    }
    const m = Math.max(1, c.nodes.length);
    x /= m;
    y /= m;
    z /= m;
    let ss = 0;
    for (const i of c.nodes) ss += (pos[i * 3] - x) ** 2 + (pos[i * 3 + 1] - y) ** 2 + (pos[i * 3 + 2] - z) ** 2;
    const spread = Math.sqrt(ss / m);
    centroids.set([x, y, z], c.index * 3);
    spreads[c.index] = spread;
    if (spread > 16) {
      // Diffuse cluster (its notes spread through the whole orb): label it where its notes are densest,
      // not at the shell along its anchor (that left e.g. SUMMARIES floating in empty space).
      const sub = densestSubCentroid(pos, c.nodes, Math.max(8, spread * 0.45));
      labelPos.set(sub, c.index * 3);
      continue;
    }
    // Compact cluster: label just outside it, along the centroid direction (or the anchor direction when
    // the centroid sits at the core).
    let len = Math.hypot(x, y, z);
    let dx = x;
    let dy = y;
    let dz = z;
    if (len < 12) {
      dx = A[c.index * 3];
      dy = A[c.index * 3 + 1];
      dz = A[c.index * 3 + 2];
      len = Math.hypot(dx, dy, dz) || 1;
    }
    const out = Math.min(68, Math.max(26, Math.hypot(x, y, z) + spread * 0.7 + 6));
    labelPos.set([(dx / len) * out, (dy / len) * out, (dz / len) * out], c.index * 3);
  }
  return { pos, centroids, spreads, labelPos, radius: p95 * k };
}

/** Centroid of the densest neighbourhood (radius `r`) among `members` (≤ 240 sampled seeds). */
function densestSubCentroid(pos: Float32Array, members: number[], r: number): [number, number, number] {
  const r2 = r * r;
  const step = Math.max(1, Math.floor(members.length / 240));
  let best = members[0] ?? 0;
  let bestN = -1;
  for (let a = 0; a < members.length; a += step) {
    const i = members[a] * 3;
    let k = 0;
    for (const j of members) {
      const q = j * 3;
      const dx = pos[i] - pos[q];
      const dy = pos[i + 1] - pos[q + 1];
      const dz = pos[i + 2] - pos[q + 2];
      if (dx * dx + dy * dy + dz * dz < r2) k++;
    }
    if (k > bestN) {
      bestN = k;
      best = members[a];
    }
  }
  const b = best * 3;
  let x = 0;
  let y = 0;
  let z = 0;
  let k = 0;
  for (const j of members) {
    const q = j * 3;
    const dx = pos[b] - pos[q];
    const dy = pos[b + 1] - pos[q + 1];
    const dz = pos[b + 2] - pos[q + 2];
    if (dx * dx + dy * dy + dz * dz < r2) {
      x += pos[q];
      y += pos[q + 1];
      z += pos[q + 2];
      k++;
    }
  }
  k = Math.max(1, k);
  return [x / k, y / k, z / k];
}

// ───────── Per-model caches (a graph is immutable once built; GC'd with its model) ─────────

const orbCache = new WeakMap<GraphModel, OrbLayout>();
const forceCache = new WeakMap<GraphModel, Layout2D>();

/** orbLayout() computed once per graph model (the orb unmounts on every view switch). */
export function orbLayoutFor(model: GraphModel): OrbLayout {
  let l = orbCache.get(model);
  if (!l) {
    l = orbLayout(model);
    orbCache.set(model, l);
  }
  return l;
}

/** The settled 2D force layout for `model`, if one was computed earlier this session. */
export const cachedForceLayout = (model: GraphModel): Layout2D | null => forceCache.get(model) ?? null;
export const storeForceLayout = (model: GraphModel, layout: Layout2D) => void forceCache.set(model, layout);
