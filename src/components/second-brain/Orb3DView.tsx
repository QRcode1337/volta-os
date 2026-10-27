'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Crosshair, Move3d } from 'lucide-react';
import { formatInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { hexRgb, prng, type GraphModel } from './graph-model';
import { orbLayoutFor } from './graph-layout';

interface OrbProps {
  model: GraphModel;
  matches: Set<string> | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Pixels covered by the inspector drawers on each side (0 when closed): the orb re-centres into the gap. */
  insetLeft?: number;
  insetRight?: number;
  /** Deep-link target to swing the camera to once (a note in `model`); `onFocused` is called after it's handled. */
  focusId?: string | null;
  onFocused?: () => void;
}

/** Camera distance used when a deep link swings the orb to a note (zoom ≈ 130%). */
const FOCUS_RADIUS = 135;

const LABEL_ZOOM_THRESHOLD = 125; // camera distance below which the wider label set fades in
const ALWAYS_LABELS = 12; // most-linked notes keep a (depth-faded) label at any zoom
const HUB_LABELS = 36; // eligible once zoomed in
const SEARCH_LABELS = 40;
const NEIGHBOUR_LABELS = 12;
const MIN_R = 24;
const MAX_R = 330;

const folderName = (folder: string, vault: string) => (folder === '(root)' ? `${vault} root` : folder);

const POINT_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aPhase;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform float uDim;
  uniform float uTwinkle;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = -mv.z;
    gl_PointSize = aSize * uPixelRatio * (220.0 / max(depth, 1.0));
    float tw = 1.0 - uTwinkle + uTwinkle * (0.55 + 0.45 * sin(uTime * (0.6 + aPhase * 1.7) + aPhase * 30.0));
    vColor = aColor;
    vAlpha = aAlpha * uDim * tw * clamp(1.5 - depth / 420.0, 0.22, 1.0);
  }
`;

const POINT_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float halo = smoothstep(0.5, 0.0, d);
    float core = smoothstep(0.2, 0.0, d);
    gl_FragColor = vec4(vColor * (0.55 + core * 0.9), (halo * halo) * vAlpha + core * vAlpha * 0.6);
  }
`;

const LINE_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aT;
  attribute float aAlpha;
  attribute float aSeed;
  varying vec3 vColor;
  varying float vT;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    vColor = aColor; vT = aT; vAlpha = aAlpha; vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LINE_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vColor;
  varying float vT;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    float p = fract(vT - uTime * 0.38 + vSeed);
    float pulse = exp(-pow((p - 0.5) * 7.0, 2.0));
    gl_FragColor = vec4(vColor * (0.7 + pulse), vAlpha * (0.28 + 0.95 * pulse));
  }
`;

const FLOW_VERT = /* glsl */ `
  attribute vec3 aEnd;
  attribute float aOffset;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uDim;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float t = fract(uTime * 0.22 + aOffset);
    vec3 p = mix(position, aEnd, t);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = 3.0 * uPixelRatio * (220.0 / max(-mv.z, 1.0));
    vColor = aColor;
    vAlpha = sin(t * 3.14159) * uDim;
  }
`;

function pointMaterial(pixelRatio: number, twinkle: number) {
  return new THREE.ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    uniforms: {
      uPixelRatio: { value: pixelRatio },
      uTime: { value: 0 },
      uDim: { value: 1 },
      uTwinkle: { value: twinkle },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function Orb3DView({ model, matches, selectedId, onSelect, insetLeft = 0, insetRight = 0, focusId = null, onFocused }: OrbProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const clusterLabelRefs = useRef(new Map<string, HTMLDivElement>());
  const nodeLabelRefs = useRef(new Map<number, HTMLDivElement>());
  const hoverTagRef = useRef<HTMLDivElement>(null);
  const matchesRef = useRef(matches);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const applyHighlightRef = useRef<() => void>(() => {});
  const resetRef = useRef<() => void>(() => {});
  const focusRef = useRef<(id: string) => boolean>(() => false);
  const onFocusedRef = useRef(onFocused);
  onFocusedRef.current = onFocused;
  const insetsRef = useRef({ l: insetLeft, r: insetRight });
  const [zoomPct, setZoomPct] = useState(100);
  const [hoverIdx, setHoverIdx] = useState(-1);

  onSelectRef.current = onSelect;
  insetsRef.current = { l: insetLeft, r: insetRight };
  const { nodes, clusters } = model;

  // Cached per model: switching views no longer re-runs the 3D layout on the main thread.
  const layout = useMemo(() => orbLayoutFor(model), [model]);
  const byRank = useMemo(() => nodes.map((_, i) => i).sort((a, b) => nodes[a].rank - nodes[b].rank), [nodes]);

  // Cluster labels: the biggest folders, plus each vault's largest folder.
  const clusterLabels = useMemo(() => {
    const keep = new Set<number>();
    [...clusters].sort((a, b) => b.shown - a.shown).slice(0, 5).forEach((c) => keep.add(c.index));
    for (const v of model.vaults) if (v.clusters.length) keep.add(v.clusters[0]);
    // Highest-priority first: the per-frame overlap pass hides later labels that collide.
    return [...keep].sort((a, b) => clusters[b].shown - clusters[a].shown).map((ci) => {
      const c = clusters[ci];
      return {
        id: c.key,
        text: folderName(c.folder, c.vault).toUpperCase(),
        color: c.color,
        pos: new THREE.Vector3(layout.labelPos[ci * 3], layout.labelPos[ci * 3 + 1], layout.labelPos[ci * 3 + 2]),
        sub: `${c.vault.toUpperCase()} · ${formatInt(c.total)} NOTES`,
      };
    });
  }, [clusters, layout, model.vaults]);

  // Node labels rendered as DOM (kept small), in placement priority for the per-frame overlap pass:
  // selection → search hits → selection's neighbours → top hubs, [cluster labels], then the other hubs.
  const labelPlan = useMemo(() => {
    const order: number[] = [];
    const seen = new Set<number>();
    const add = (i: number) => {
      if (i >= 0 && !seen.has(i)) {
        seen.add(i);
        order.push(i);
      }
    };
    const sel = selectedId ? model.byId.get(selectedId) : undefined;
    if (sel) add(sel.index);
    if (matches) {
      let k = 0;
      for (const i of byRank) {
        if (!matches.has(nodes[i].id)) continue;
        add(i);
        if (++k >= SEARCH_LABELS) break;
      }
    }
    if (sel) [...model.adj[sel.index]].sort((a, b) => nodes[b].degree - nodes[a].degree).slice(0, NEIGHBOUR_LABELS).forEach(add);
    byRank.slice(0, ALWAYS_LABELS).forEach(add);
    const beforeClusters = order.length;
    byRank.slice(ALWAYS_LABELS, HUB_LABELS).forEach(add);
    return { order, beforeClusters };
  }, [byRank, matches, selectedId, model, nodes]);
  const labelIdx = labelPlan.order;
  const labelPlanRef = useRef(labelPlan);
  labelPlanRef.current = labelPlan;
  const nodeLabelSize = useRef(new Map<number, [number, number]>());

  // ── Scene setup ──
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const N = nodes.length;
    const P = layout.pos;
    const posOf = (i: number) => new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 3000);
    const world = new THREE.Group();
    scene.add(world);

    const disposables: { dispose: () => void }[] = [];
    const rnd = prng(424846);
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;

    // Ambient dust (decorative): per-folder clouds around the real cluster centroids, streams to the core, outer shell.
    const dustPos: number[] = [];
    const dustCol: number[] = [];
    const dustSize: number[] = [];
    const dustAlpha: number[] = [];
    const dustPhase: number[] = [];
    const pushDust = (x: number, y: number, z: number, rgb: [number, number, number], size: number, alpha: number) => {
      dustPos.push(x, y, z);
      dustCol.push(...rgb);
      dustSize.push(size);
      dustAlpha.push(alpha);
      dustPhase.push(rnd());
    };
    for (const c of clusters) {
      const cx = layout.centroids[c.index * 3];
      const cy = layout.centroids[c.index * 3 + 1];
      const cz = layout.centroids[c.index * 3 + 2];
      const sp = Math.max(5, Math.min(26, layout.spreads[c.index] * 0.75));
      const rgb = hexRgb(c.color);
      const count = Math.round(Math.min(700, Math.max(40, Math.sqrt(c.shown) * 30)));
      for (let i = 0; i < count; i++) pushDust(cx + gauss() * sp, cy + gauss() * sp, cz + gauss() * sp, rgb, 1.1 + rnd() * 2, 0.3 + rnd() * 0.4);
      for (let i = 0; i < 60; i++) {
        const t = rnd();
        const j = 2 + Math.sin(t * Math.PI) * 5;
        pushDust(cx * t + gauss() * j, cy * t + gauss() * j, cz * t + gauss() * j, rgb, 0.8 + rnd() * 1.3, 0.2 + rnd() * 0.28);
      }
    }
    const coreRgb = hexRgb('#FF5500');
    const paperRgb = hexRgb('#F5F2EB');
    for (let i = 0; i < 320; i++) pushDust(gauss() * 8, gauss() * 8, gauss() * 8, i % 3 === 0 ? coreRgb : paperRgb, 1 + rnd() * 2, 0.26 + rnd() * 0.36);
    for (let i = 0; i < 1100; i++) {
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = 104 + rnd() * 40;
      pushDust(Math.cos(th) * s * r, u * r, Math.sin(th) * s * r, [0.45, 0.43, 0.4], 0.7 + rnd() * 1.1, 0.12 + rnd() * 0.22);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dustPos, 3));
    dustGeo.setAttribute('aColor', new THREE.Float32BufferAttribute(dustCol, 3));
    dustGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(dustSize, 1));
    dustGeo.setAttribute('aAlpha', new THREE.Float32BufferAttribute(dustAlpha, 1));
    dustGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(dustPhase, 1));
    const dustMat = pointMaterial(pixelRatio, 0.6);
    world.add(new THREE.Points(dustGeo, dustMat));
    disposables.push(dustGeo, dustMat);

    // Notes
    const maxDeg = model.maxDegree;
    const nCol = new Float32Array(N * 3);
    const nSize = new Float32Array(N);
    const nAlpha = new Float32Array(N).fill(1);
    const nPhase = new Float32Array(N);
    const baseSize = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      nCol.set(hexRgb(nodes[i].color), i * 3);
      baseSize[i] = 3.6 + Math.sqrt(nodes[i].degree / maxDeg) * 11;
      nSize[i] = baseSize[i];
      nPhase[i] = (i * 0.618) % 1;
    }
    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
    nodeGeo.setAttribute('aColor', new THREE.BufferAttribute(nCol, 3));
    const nodeSizeAttr = new THREE.BufferAttribute(nSize, 1);
    const nodeAlphaAttr = new THREE.BufferAttribute(nAlpha, 1);
    nodeGeo.setAttribute('aSize', nodeSizeAttr);
    nodeGeo.setAttribute('aAlpha', nodeAlphaAttr);
    nodeGeo.setAttribute('aPhase', new THREE.BufferAttribute(nPhase, 1));
    const nodeMat = pointMaterial(pixelRatio, 0.15);
    world.add(new THREE.Points(nodeGeo, nodeMat));
    disposables.push(nodeGeo, nodeMat);

    // Core glow + selection halo
    const haloGeo = new THREE.BufferGeometry();
    haloGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    haloGeo.setAttribute('aColor', new THREE.Float32BufferAttribute([1, 0.33, 0, 1, 0.45, 0.1], 3));
    const haloSizeAttr = new THREE.Float32BufferAttribute([64, 0], 1);
    haloGeo.setAttribute('aSize', haloSizeAttr);
    haloGeo.setAttribute('aAlpha', new THREE.Float32BufferAttribute([0.18, 0.9], 1));
    haloGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute([0.2, 0.9], 1));
    const haloMat = pointMaterial(pixelRatio, 0.35);
    world.add(new THREE.Points(haloGeo, haloMat));
    disposables.push(haloGeo, haloMat);

    // Wikilinks
    const edges = model.edges;
    const E = edges.length;
    const lPos = new Float32Array(E * 6);
    const lCol = new Float32Array(E * 6);
    const lT = new Float32Array(E * 2);
    const lAlpha = new Float32Array(E * 2);
    const lSeed = new Float32Array(E * 2);
    const baseLineAlpha = new Float32Array(E);
    const hubSet = new Set(byRank.slice(0, 6));
    const flowStart: number[] = [];
    const flowEnd: number[] = [];
    const flowOff: number[] = [];
    const flowCol: number[] = [];
    edges.forEach((e, i) => {
      lPos.set([P[e.s * 3], P[e.s * 3 + 1], P[e.s * 3 + 2], P[e.t * 3], P[e.t * 3 + 1], P[e.t * 3 + 2]], i * 6);
      lCol.set([...hexRgb(nodes[e.s].color), ...hexRgb(nodes[e.t].color)], i * 6);
      lT.set([0, 1], i * 2);
      const s = (i * 0.137) % 1;
      lSeed.set([s, s], i * 2);
      const hubEdge = hubSet.has(e.s) || hubSet.has(e.t);
      baseLineAlpha[i] = hubEdge ? 0.13 : 0.09;
      lAlpha.set([baseLineAlpha[i], baseLineAlpha[i]], i * 2);
      // Flow particles travel into the six most-linked hubs (every other link, capped).
      if (hubEdge && i % 2 === 0 && flowOff.length < 650) {
        const hub = hubSet.has(e.t) ? e.t : e.s;
        const leaf = hub === e.t ? e.s : e.t;
        flowStart.push(P[leaf * 3], P[leaf * 3 + 1], P[leaf * 3 + 2]);
        flowEnd.push(P[hub * 3], P[hub * 3 + 1], P[hub * 3 + 2]);
        flowOff.push(s);
        flowCol.push(...hexRgb(nodes[hub].color));
      }
    });
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3));
    lineGeo.setAttribute('aColor', new THREE.BufferAttribute(lCol, 3));
    lineGeo.setAttribute('aT', new THREE.BufferAttribute(lT, 1));
    const lineAlphaAttr = new THREE.BufferAttribute(lAlpha, 1);
    lineGeo.setAttribute('aAlpha', lineAlphaAttr);
    lineGeo.setAttribute('aSeed', new THREE.BufferAttribute(lSeed, 1));
    const lineMat = new THREE.ShaderMaterial({
      vertexShader: LINE_VERT,
      fragmentShader: LINE_FRAG,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    world.add(new THREE.LineSegments(lineGeo, lineMat));
    disposables.push(lineGeo, lineMat);

    const flowGeo = new THREE.BufferGeometry();
    flowGeo.setAttribute('position', new THREE.Float32BufferAttribute(flowStart, 3));
    flowGeo.setAttribute('aEnd', new THREE.Float32BufferAttribute(flowEnd, 3));
    flowGeo.setAttribute('aOffset', new THREE.Float32BufferAttribute(flowOff, 1));
    flowGeo.setAttribute('aColor', new THREE.Float32BufferAttribute(flowCol, 3));
    const flowMat = new THREE.ShaderMaterial({
      vertexShader: FLOW_VERT,
      fragmentShader: POINT_FRAG,
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio }, uDim: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const flowPoints = new THREE.Points(flowGeo, flowMat);
    flowPoints.frustumCulled = false;
    world.add(flowPoints);
    disposables.push(flowGeo, flowMat);

    // ── Highlight (search + selection) ──
    const selIndex = () => {
      const id = selectedRef.current;
      return id ? (model.byId.get(id)?.index ?? -1) : -1;
    };
    // The selection and its neighbours always stay visible, even when they don't match the search.
    let selNb: Set<number> | null = null;
    const applyHighlight = () => {
      const m = matchesRef.current;
      const si = selIndex();
      selNb = si >= 0 ? new Set([si, ...model.adj[si]]) : null;
      for (let i = 0; i < N; i++) {
        const hit = !m || m.has(nodes[i].id);
        const nbr = !!selNb && selNb.has(i);
        nAlpha[i] = i === si ? 1 : m ? (hit ? 1 : nbr ? 0.7 : 0.1) : selNb ? (nbr ? 1 : 0.4) : 1;
        nSize[i] = baseSize[i] * (m && hit ? 1.5 : 1) * (si === i ? 1.5 : 1);
      }
      nodeAlphaAttr.needsUpdate = true;
      nodeSizeAttr.needsUpdate = true;
      for (let i = 0; i < E; i++) {
        const e = edges[i];
        const selHit = si >= 0 && (e.s === si || e.t === si);
        const hit = !m || m.has(nodes[e.s].id) || m.has(nodes[e.t].id);
        const a = selHit ? 1.1 : m ? (hit ? 0.35 : 0.02) : si >= 0 ? 0.04 : baseLineAlpha[i];
        lAlpha[i * 2] = a;
        lAlpha[i * 2 + 1] = a;
      }
      lineAlphaAttr.needsUpdate = true;
      dustMat.uniforms.uDim.value = m ? 0.35 : si >= 0 ? 0.6 : 1;
      flowMat.uniforms.uDim.value = m || si >= 0 ? 0.25 : 1;
      const haloPos = haloGeo.getAttribute('position') as THREE.BufferAttribute;
      if (si >= 0) {
        haloPos.setXYZ(1, P[si * 3], P[si * 3 + 1], P[si * 3 + 2]);
        haloSizeAttr.setX(1, baseSize[si] * 4.2);
      } else {
        haloSizeAttr.setX(1, 0);
      }
      haloPos.needsUpdate = true;
      haloSizeAttr.needsUpdate = true;
    };
    applyHighlightRef.current = applyHighlight;
    applyHighlight();

    // ── Hand-rolled orbit controls ──
    const orbit = { theta: 0.6, phi: 1.18, radius: 220, radiusGoal: 175, vTheta: 0, vPhi: 0 };
    const target = new THREE.Vector3();
    const targetGoal = new THREE.Vector3();
    const pointer = { x: -9999, y: -9999, inside: false, down: false, downX: 0, downY: 0, lastX: 0, lastY: 0, moved: 0 };
    let hovered = -1;
    // Node under the pointer at pointerdown. The frame loop clears `hovered` while the button is held, so a click
    // (down → up a few frames later) must select what was hovered when it started.
    let downHit = -1;
    let lastInteraction = 0;
    let lastZoomPct = -1;
    let w = 1;
    let h = 1;

    // Deep-link focus: ease the orbit angles to look at the note from outside the orb. The camera target already
    // follows the selection (0.6 × its position), so with the camera on the note's own radial line the note sits
    // in the centre of the view. Held (auto-rotate off) until the user drags or the selection moves on.
    const focus = { idx: -1, theta: 0, phi: 0 };
    focusRef.current = (id) => {
      const i = model.byId.get(id)?.index ?? -1;
      if (i < 0) return false;
      const x = P[i * 3];
      const y = P[i * 3 + 1];
      const z = P[i * 3 + 2];
      const len = Math.hypot(x, y, z);
      focus.idx = i;
      focus.theta = len > 1e-3 ? Math.atan2(x, z) : orbit.theta;
      focus.phi = len > 1e-3 ? THREE.MathUtils.clamp(Math.acos(y / len), 0.15, Math.PI - 0.15) : orbit.phi;
      orbit.vTheta = 0;
      orbit.vPhi = 0;
      orbit.radiusGoal = Math.min(orbit.radiusGoal, FOCUS_RADIUS);
      return true;
    };

    resetRef.current = () => {
      focus.idx = -1;
      orbit.radiusGoal = 175;
      orbit.vTheta = 0.04;
      orbit.vPhi = (1.18 - orbit.phi) * 0.08;
      targetGoal.set(0, 0, 0);
    };

    const el = renderer.domElement;
    el.style.cursor = 'grab';
    const onDown = (e: PointerEvent) => {
      focus.idx = -1;
      downHit = hovered;
      pointer.down = true;
      pointer.downX = pointer.lastX = e.clientX;
      pointer.downY = pointer.lastY = e.clientY;
      pointer.moved = 0;
      orbit.vTheta = 0;
      orbit.vPhi = 0;
      el.setPointerCapture(e.pointerId);
      lastInteraction = performance.now();
    };
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.inside = true;
      if (!pointer.down) return;
      const dx = e.clientX - pointer.lastX;
      const dy = e.clientY - pointer.lastY;
      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
      pointer.moved += Math.abs(dx) + Math.abs(dy);
      const dT = -dx * 0.0055;
      const dP = -dy * 0.0055;
      orbit.theta += dT;
      orbit.phi = THREE.MathUtils.clamp(orbit.phi + dP, 0.15, Math.PI - 0.15);
      orbit.vTheta = dT;
      orbit.vPhi = dP;
      lastInteraction = performance.now();
    };
    const onUp = (e: PointerEvent) => {
      if (!pointer.down) return;
      pointer.down = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (pointer.moved < 5 && downHit >= 0) onSelectRef.current(nodes[downHit].id);
      downHit = -1;
    };
    const onLeave = () => {
      pointer.inside = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbit.radiusGoal = THREE.MathUtils.clamp(orbit.radiusGoal * Math.exp(e.deltaY * 0.0012), MIN_R, MAX_R);
      lastInteraction = performance.now();
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('wheel', onWheel, { passive: false });

    const resize = () => {
      w = Math.max(1, host.clientWidth);
      h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    // ── Loop ──
    const v = new THREE.Vector3();
    const wp = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const placed: number[] = [];
    const labelSize = new Map<string, [number, number]>();
    let shift = 0;
    let appliedShift = 0;
    let appliedW = 0;
    let appliedH = 0;
    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const t = (now - t0) / 1000;

      const si = selIndex();
      if (focus.idx >= 0 && focus.idx !== si) focus.idx = -1; // selection moved on → normal orbit again
      if (!pointer.down) {
        orbit.theta += orbit.vTheta;
        orbit.phi = THREE.MathUtils.clamp(orbit.phi + orbit.vPhi, 0.15, Math.PI - 0.15);
        orbit.vTheta *= 0.93;
        orbit.vPhi *= 0.9;
        if (focus.idx >= 0) {
          // Shortest way round to the focus angles (eased).
          orbit.theta += Math.atan2(Math.sin(focus.theta - orbit.theta), Math.cos(focus.theta - orbit.theta)) * 0.07;
          orbit.phi += (focus.phi - orbit.phi) * 0.07;
        } else if (now - lastInteraction > 2500 && hovered < 0) orbit.theta += 0.0011;
      }
      orbit.radius += (orbit.radiusGoal - orbit.radius) * 0.12;

      if (si >= 0) targetGoal.set(P[si * 3], P[si * 3 + 1], P[si * 3 + 2]).multiplyScalar(0.6);
      else targetGoal.set(0, 0, 0);
      target.lerp(targetGoal, 0.05);

      const { theta, phi, radius } = orbit;
      camera.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta),
      );
      camera.lookAt(target);
      camera.updateMatrixWorld();

      // Re-centre the projection into the visible gap between the inspector drawers (eased).
      const ins = insetsRef.current;
      const shiftGoal = (ins.l || ins.r) && w - ins.l - ins.r > 160 ? (ins.l - ins.r) / 2 : 0;
      shift += (shiftGoal - shift) * 0.12;
      if (Math.abs(shiftGoal - shift) < 0.3) shift = shiftGoal;
      if (shift !== appliedShift || w !== appliedW || h !== appliedH) {
        appliedShift = shift;
        appliedW = w;
        appliedH = h;
        if (Math.abs(shift) < 0.5) camera.clearViewOffset();
        else camera.setViewOffset(w, h, -shift, 0, w, h);
      }

      dustMat.uniforms.uTime.value = t;
      nodeMat.uniforms.uTime.value = t;
      haloMat.uniforms.uTime.value = t;
      lineMat.uniforms.uTime.value = t;
      flowMat.uniforms.uTime.value = t;

      renderer.render(scene, camera);

      const m = matchesRef.current;
      // Hover pick (screen space) — only while the pointer is over the canvas.
      let best = -1;
      if (pointer.inside && !pointer.down) {
        let bestD = 14 * 14;
        for (let i = 0; i < N; i++) {
          if (m && !m.has(nodes[i].id) && !selNb?.has(i)) continue;
          v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).project(camera);
          if (v.z > 1) continue;
          const dd = ((v.x * 0.5 + 0.5) * w - pointer.x) ** 2 + ((-v.y * 0.5 + 0.5) * h - pointer.y) ** 2;
          if (dd < bestD) {
            bestD = dd;
            best = i;
          }
        }
      }
      if (best !== hovered) {
        hovered = best;
        el.style.cursor = hovered >= 0 ? 'pointer' : pointer.down ? 'grabbing' : 'grab';
        setHoverIdx(hovered);
      }

      // Labels: ONE overlap pass in priority order — selection, search hits, the selection's neighbours and
      // the top hubs first, then the cluster labels, then the remaining hubs — so labels never stack.
      placed.length = 0;
      const overlaps = (x0: number, y0: number, x1: number, y1: number) => {
        for (let b = 0; b < placed.length; b += 4) {
          if (x0 < placed[b + 2] && x1 > placed[b] && y0 < placed[b + 3] && y1 > placed[b + 1]) return true;
        }
        return false;
      };
      const zoomIn = THREE.MathUtils.clamp((LABEL_ZOOM_THRESHOLD - radius) / 40, 0, 1);
      const placeClusterLabels = () => {
        for (const c of clusterLabels) {
          const lab = clusterLabelRefs.current.get(c.id);
          if (!lab) continue;
          v.copy(c.pos).project(camera);
          const sx = (v.x * 0.5 + 0.5) * w;
          const sy = (-v.y * 0.5 + 0.5) * h;
          const behind = v.z > 1;
          let size = labelSize.get(c.id);
          if (!size || !size[0]) {
            size = [lab.offsetWidth, lab.offsetHeight];
            labelSize.set(c.id, size);
          }
          const x0 = sx - size[0] / 2 - 4;
          const y0 = sy - size[1] / 2 - 2;
          const x1 = sx + size[0] / 2 + 4;
          const y1 = sy + size[1] / 2 + 2;
          const blocked = !behind && overlaps(x0, y0, x1, y1);
          if (!behind && !blocked) placed.push(x0, y0, x1, y1);
          const dist = wp.copy(c.pos).distanceTo(camera.position);
          const depthFade = THREE.MathUtils.clamp(1.35 - dist / (radius * 1.6), 0.3, 1);
          lab.style.opacity = behind || blocked ? '0' : String((m || si >= 0 ? 0.4 : 1) * depthFade * (1 - zoomIn * 0.4));
          lab.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
        }
      };
      const plan = labelPlanRef.current;
      const nb = selNb;
      for (let k = 0; k < plan.order.length; k++) {
        if (k === plan.beforeClusters) placeClusterLabels();
        const i = plan.order[k];
        const lab = nodeLabelRefs.current.get(i);
        if (!lab) continue;
        tmp.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
        v.copy(tmp).project(camera);
        const behind = v.z > 1;
        const sx = (v.x * 0.5 + 0.5) * w;
        const sy = (-v.y * 0.5 + 0.5) * h;
        const dist = wp.copy(tmp).distanceTo(camera.position);
        const near = THREE.MathUtils.clamp(1.55 - dist / Math.max(radius, 1), 0, 1);
        const rank = nodes[i].rank;
        let op = rank < ALWAYS_LABELS ? Math.max(0.35, near) * (1 - zoomIn * 0.2) : zoomIn * near;
        if (i === si) op = 1;
        else if (nb?.has(i)) op = Math.max(op, 0.85);
        else if (m) op = m.has(nodes[i].id) ? Math.max(op, 0.95) : op * 0.12;
        else if (si >= 0) op *= 0.3;
        if (behind || i === hovered) op = 0; // the hover tag shows the hovered note's name
        if (op > 0.04) {
          let size = nodeLabelSize.current.get(i);
          if (!size || !size[0]) {
            size = [lab.offsetWidth, lab.offsetHeight];
            nodeLabelSize.current.set(i, size);
          }
          // Box matches translate(-50%, -150%): centred on x, one label-height above the point.
          const x0 = sx - size[0] / 2 - 3;
          const x1 = sx + size[0] / 2 + 3;
          const y0 = sy - size[1] * 1.5 - 1;
          const y1 = sy - size[1] * 0.5 + 1;
          if (i !== si && overlaps(x0, y0, x1, y1)) op = 0;
          else placed.push(x0, y0, x1, y1);
        }
        lab.style.opacity = op.toFixed(3);
        lab.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -150%)`;
      }
      if (plan.beforeClusters >= plan.order.length) placeClusterLabels();

      const tag = hoverTagRef.current;
      if (tag) {
        if (hovered >= 0) {
          v.set(P[hovered * 3], P[hovered * 3 + 1], P[hovered * 3 + 2]).project(camera);
          tag.style.opacity = '1';
          tag.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px, 0) translate(-50%, -165%)`;
        } else tag.style.opacity = '0';
      }

      const zp = Math.round((175 / radius) * 100);
      if (Math.abs(zp - lastZoomPct) >= 2) {
        lastZoomPct = zp;
        setZoomPct(zp);
      }
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('wheel', onWheel);
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (el.parentElement === host) host.removeChild(el);
      applyHighlightRef.current = () => {};
      resetRef.current = () => {};
      focusRef.current = () => false;
    };
  }, [model, nodes, clusters, layout, byRank, clusterLabels]);

  useEffect(() => {
    matchesRef.current = matches;
    selectedRef.current = selectedId;
    applyHighlightRef.current();
  }, [matches, selectedId]);

  // Deep link (?node=…): after the scene exists and the selection ref is current (effects run in order).
  useEffect(() => {
    if (!focusId) return;
    focusRef.current(focusId);
    onFocusedRef.current?.();
  }, [focusId, model, layout]);

  const hovered = hoverIdx >= 0 ? nodes[hoverIdx] : null;
  // With the inspector open the drawers cover the sides: the legend steps aside, the controls move to the
  // free strip above the right drawer and the hint centres in the visible gap.
  const inspecting = insetLeft > 0 || insetRight > 0;

  return (
    <div className="sb-grid-bg relative h-full w-full overflow-hidden">
      <div ref={hostRef} className="absolute inset-0" />

      {/* Projected HTML labels */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {clusterLabels.map((c) => (
          <div
            key={c.id}
            ref={(el) => {
              if (el) clusterLabelRefs.current.set(c.id, el);
              else clusterLabelRefs.current.delete(c.id);
            }}
            className="absolute left-0 top-0 whitespace-nowrap text-center will-change-transform"
            style={{ opacity: 0, transition: 'opacity 180ms ease' }}
          >
            <div
              className="rounded-full border bg-obsidian/70 px-2.5 py-0.5 font-mono text-[10.5px] font-semibold tracking-[0.14em] backdrop-blur-sm"
              style={{ color: c.color, borderColor: `${c.color}55`, boxShadow: `0 0 18px ${c.color}22` }}
            >
              {c.text}
            </div>
            <div className="mt-0.5 font-mono text-[8.5px] tracking-[0.18em] text-muted">{c.sub}</div>
          </div>
        ))}
        {labelIdx.map((i) => (
          <div
            key={nodes[i].id}
            ref={(el) => {
              nodeLabelSize.current.delete(i);
              if (el) nodeLabelRefs.current.set(i, el);
              else nodeLabelRefs.current.delete(i);
            }}
            className="absolute left-0 top-0 max-w-[220px] truncate whitespace-nowrap rounded bg-obsidian/60 px-1 font-mono text-[10px] will-change-transform"
            style={{ opacity: 0, transition: 'opacity 140ms linear', color: nodes[i].rank < ALWAYS_LABELS ? '#F5F2EB' : nodes[i].color }}
          >
            {nodes[i].label}
          </div>
        ))}
        <div
          ref={hoverTagRef}
          className="absolute left-0 top-0 max-w-[260px] truncate whitespace-nowrap rounded border border-subtle bg-obsidian/85 px-1.5 py-px font-mono text-[10.5px] text-paper will-change-transform"
          style={{ opacity: 0 }}
        >
          {hovered?.label}
        </div>
      </div>

      {/* HUD: legend */}
      <div
        className={cn(
          'pointer-events-none absolute left-4 top-4 z-10 w-[210px] rounded-lg border border-subtle bg-panel/80 p-2.5 backdrop-blur transition-opacity duration-200',
          inspecting && 'opacity-0',
        )}
        aria-hidden={inspecting}
      >
        <div className="hud-label mb-2 flex items-center gap-1.5 !text-[10px]">
          <Move3d size={12} className="text-orange" /> SECOND BRAIN · ORB
        </div>
        <div className="space-y-1.5">
          {model.vaults
            .filter((vt) => vt.shown > 0)
            .map((vt) => (
              <div key={vt.id}>
                <div className="flex items-center gap-2 font-mono text-[10px] text-paper">
                  <span className="h-2 w-2 rounded-full" style={{ background: vt.color, boxShadow: `0 0 6px ${vt.color}` }} />
                  <span className="flex-1 truncate font-semibold">{vt.name}</span>
                  <span className="text-muted">{formatInt(vt.total)}</span>
                </div>
                {vt.clusters.slice(0, 3).map((ci) => {
                  const c = clusters[ci];
                  return (
                    <div key={c.key} className="ml-4 flex items-center gap-1.5 font-mono text-[9px] text-secondary">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
                      <span className="flex-1 truncate">{folderName(c.folder, c.vault)}</span>
                      <span className="text-muted">{formatInt(c.total)}</span>
                    </div>
                  );
                })}
              </div>
            ))}
        </div>
        <div className="mt-2 border-t border-subtle pt-1.5 font-mono text-[8.5px] leading-snug text-muted">
          {formatInt(nodes.length)} most-linked of {formatInt(model.totalNotes)} notes in view · {formatInt(model.edges.length)} of {formatInt(model.totalLinks)} links · counts = all notes
        </div>
      </div>

      {/* HUD: hover + controls */}
      <div
        className="pointer-events-none absolute bottom-4 z-10 flex flex-col items-center text-center"
        style={inspecting ? { left: insetLeft + 16, right: insetRight + 16 } : { left: '15%', right: '15%' }}
      >
        <div className="mb-1 h-5 max-w-full truncate font-mono text-[12px] text-paper">
          {hovered ? (
            <>
              <span style={{ color: hovered.color }}>◉</span> {hovered.label}
              <span className="ml-2 text-muted">
                {hovered.vault} / {folderName(hovered.folder, hovered.vault)} · {formatInt(hovered.degree)} links — click to inspect
              </span>
            </>
          ) : (
            ''
          )}
        </div>
        <div className="max-w-full truncate font-mono text-[9.5px] tracking-[0.16em] text-muted">
          {inspecting ? 'DRAG TO ROTATE · SCROLL TO ZOOM · CLICK A NODE' : 'DRAG TO ROTATE · SCROLL TO ZOOM · ZOOM IN TO REVEAL NOTES · CLICK A NODE'}
        </div>
      </div>
      <div className={cn('absolute right-4 z-10 flex items-center gap-2', inspecting ? 'top-4' : 'bottom-4')}>
        <span className="rounded-full border border-subtle bg-panel/80 px-2.5 py-1 font-mono text-[10px] text-secondary">ZOOM {zoomPct}%</span>
        <button
          type="button"
          onClick={() => resetRef.current()}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-subtle bg-panel-elevated px-2.5 font-mono text-[10px] font-semibold text-secondary hover:border-highlight hover:text-paper"
        >
          <Crosshair size={11} /> RESET
        </button>
      </div>
    </div>
  );
}

export default Orb3DView;
