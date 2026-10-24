'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import { seededRandom } from '@/lib/mock-data';
import { formatInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { SPHERE_GROUPS, sphereFractions, type SphereCounts, type SphereGroupId } from './orbital/sphere-groups';

export interface SecondBrainSphere3DProps {
  /** CSS px edge of the square canvas. */
  size?: number;
  /** Multiplier on the base 0.003 rad/frame auto-rotation (0 = paused). */
  speed?: number;
  reduceMotion?: boolean;
  /** Where a click (not a drag) navigates. */
  href?: string;
  onHoverChange?: (hovering: boolean) => void;
  /** Real counts per particle group; each group's particle density scales with log(count). */
  counts?: SphereCounts;
  className?: string;
}

// ───────────────────────── point cloud construction ─────────────────────────

interface Cloud {
  position: Float32Array;
  color: Float32Array;
  size: Float32Array;
  phase: Float32Array;
  alpha: Float32Array;
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function makeCloud(count: number): Cloud {
  return {
    position: new Float32Array(count * 3),
    color: new Float32Array(count * 3),
    size: new Float32Array(count),
    phase: new Float32Array(count),
    alpha: new Float32Array(count),
  };
}

function put(c: Cloud, i: number, p: [number, number, number], rgb: [number, number, number], size: number, alpha: number, phase: number) {
  c.position.set(p, i * 3);
  c.color.set(rgb, i * 3);
  c.size[i] = size;
  c.alpha[i] = alpha;
  c.phase[i] = phase;
}

function unitDir(rnd: () => number): [number, number, number] {
  const u = rnd() * 2 - 1;
  const t = rnd() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return [s * Math.cos(t), u, s * Math.sin(t)];
}

function normalize(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function gauss(rnd: () => number): number {
  return (rnd() + rnd() + rnd() + rnd() - 2) / 2; // ≈ N(0, 0.29)
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const WHITE: [number, number, number] = [1, 1, 1];
const GROUP_COLOR = Object.fromEntries(SPHERE_GROUPS.map((g) => [g.id, g.color])) as Record<SphereGroupId, string>;

/** Dense white core = SKILLS. Bright "stars" come first so they survive a short draw range. */
function buildCore(rnd: () => number): Cloud {
  const N = 1300;
  const STARS = 26;
  const c = makeCloud(N + STARS);
  for (let i = 0; i < STARS; i++) {
    const d = unitDir(rnd);
    const r = 0.12 + rnd() * 0.32;
    put(c, i, [d[0] * r, d[1] * r, d[2] * r], WHITE, 7 + rnd() * 5, 0.75, rnd() * 6.283);
  }
  for (let i = 0; i < N; i++) {
    const d = unitDir(rnd);
    const r = 0.44 * Math.pow(rnd(), 1.45);
    const warm = rnd() * 0.12;
    put(c, STARS + i, [d[0] * r, d[1] * r, d[2] * r], mixRgb(WHITE, [1, 0.86, 0.74], warm), 2.4 + rnd() * 2.6, 0.2 + rnd() * 0.38, rnd() * 6.283);
  }
  return c;
}

const SHELL_PER_GROUP = 1400;
const HUBS_PER_LOBE = 10;

/** Mid shell: four lobes with dark seams — two NOTES lobes (orange) and two CAPTURES lobes (cyan). */
function buildShell(rnd: () => number): { notes: Cloud; captures: Cloud } {
  const notesRgb = hexRgb(GROUP_COLOR.notes);
  const capturesRgb = hexRgb(GROUP_COLOR.captures);
  const lobes: { group: 'notes' | 'captures'; color: [number, number, number]; dir: [number, number, number] }[] = [
    { group: 'notes', color: notesRgb, dir: normalize([0.78, 0.42, 0.46]) },
    { group: 'captures', color: capturesRgb, dir: normalize([-0.72, 0.52, -0.28]) },
    { group: 'captures', color: mixRgb(capturesRgb, [0.23, 0.51, 0.96], 0.35), dir: normalize([0.12, -0.82, 0.52]) },
    { group: 'notes', color: mixRgb(notesRgb, [0.94, 0.27, 0.27], 0.3), dir: normalize([-0.38, -0.36, -0.84]) },
  ];
  const hubs = HUBS_PER_LOBE * 2;
  const clouds = { notes: makeCloud(SHELL_PER_GROUP + hubs), captures: makeCloud(SHELL_PER_GROUP + hubs) };
  const fill = { notes: 0, captures: 0 };
  // bright hub nodes first (always inside the draw range when the group is visible)
  for (const lobe of lobes) {
    for (let h = 0; h < HUBS_PER_LOBE; h++) {
      const j = rnd() * 0.55;
      const d = normalize([lobe.dir[0] + gauss(rnd) * j, lobe.dir[1] + gauss(rnd) * j, lobe.dir[2] + gauss(rnd) * j]);
      const r = 0.68 + rnd() * 0.16;
      put(clouds[lobe.group], fill[lobe.group]++, [d[0] * r, d[1] * r, d[2] * r], mixRgb(lobe.color, WHITE, 0.25), 6.5 + rnd() * 4, 0.9, rnd() * 6.283);
    }
  }
  const cap = SHELL_PER_GROUP + hubs;
  let guard = 0;
  while ((fill.notes < cap || fill.captures < cap) && guard < SHELL_PER_GROUP * 80) {
    guard++;
    const d = unitDir(rnd);
    let best = 0;
    let bestDot = -2;
    let second = -2;
    for (let k = 0; k < lobes.length; k++) {
      const dot = d[0] * lobes[k].dir[0] + d[1] * lobes[k].dir[1] + d[2] * lobes[k].dir[2];
      if (dot > bestDot) {
        second = bestDot;
        bestDot = dot;
        best = k;
      } else if (dot > second) second = dot;
    }
    const lobe = lobes[best];
    if (fill[lobe.group] >= cap) continue;
    // Rejection sampling → dense lobes around each source with dark seams between them.
    const w = Math.max(0, (bestDot - 0.15) / 0.85);
    const seam = Math.min(1, (bestDot - second) * 4);
    if (rnd() > Math.pow(w, 1.4) * (0.25 + 0.75 * seam)) continue;
    const r = 0.6 + 0.28 * Math.pow(rnd(), 0.8) + w * 0.05;
    put(clouds[lobe.group], fill[lobe.group]++, [d[0] * r, d[1] * r, d[2] * r], mixRgb(lobe.color, WHITE, rnd() * 0.18), 2.2 + rnd() * 2.4, 0.5 + rnd() * 0.45, rnd() * 6.283);
  }
  // fill any shortfall (guard tripped) with harmless invisible points
  for (const g of ['notes', 'captures'] as const) for (; fill[g] < cap; fill[g]++) put(clouds[g], fill[g], [0, 0, 0], WHITE, 0, 0, 0);
  return clouds;
}

const RING_PER_GROUP = 1150;

/** Saturn ring split into banded ROUTINES (amber) and MCP SERVERS (violet), built flat in XZ (tilted by its parent). */
function buildRing(rnd: () => number): { routines: Cloud; mcp: Cloud } {
  const amber = hexRgb(GROUP_COLOR.routines);
  const violet = hexRgb(GROUP_COLOR.mcp);
  const clouds = { routines: makeCloud(RING_PER_GROUP), mcp: makeCloud(RING_PER_GROUP) };
  const fill = { routines: 0, mcp: 0 };
  let guard = 0;
  while ((fill.routines < RING_PER_GROUP || fill.mcp < RING_PER_GROUP) && guard < RING_PER_GROUP * 20) {
    guard++;
    const t = rnd() * Math.PI * 2;
    let r = 1.04 + 0.34 * Math.pow(rnd(), 0.9);
    if (r > 1.19 && r < 1.225) r += 0.05; // Cassini-style gap
    const band = Math.sin(t * 3 + 1.4 * Math.sin(t * 7)) + gauss(rnd) * 0.5;
    const g = band > 0 ? 'routines' : 'mcp';
    if (fill[g] >= RING_PER_GROUP) continue;
    const col = mixRgb(g === 'routines' ? amber : violet, WHITE, rnd() * 0.15);
    const y = gauss(rnd) * 0.035 * (1.4 - (r - 1.04) * 1.5);
    const outer = (r - 1.04) / 0.4;
    put(clouds[g], fill[g]++, [Math.cos(t) * r, y, Math.sin(t) * r], col, 2 + rnd() * 2.2, (0.45 + rnd() * 0.5) * (1 - outer * 0.45), rnd() * 6.283);
  }
  for (const g of ['routines', 'mcp'] as const) for (; fill[g] < RING_PER_GROUP; fill[g]++) put(clouds[g], fill[g], [0, 0, 0], WHITE, 0, 0, 0);
  return clouds;
}

/** Faint halo dust for depth. */
function buildDust(rnd: () => number): Cloud {
  const N = 520;
  const c = makeCloud(N);
  for (let i = 0; i < N; i++) {
    const d = unitDir(rnd);
    const r = 0.92 + rnd() * 0.62;
    put(c, i, [d[0] * r, d[1] * r, d[2] * r], mixRgb(WHITE, [0.65, 0.62, 0.58], rnd()), 1.6 + rnd() * 1.6, 0.12 + rnd() * 0.22, rnd() * 6.283);
  }
  return c;
}

function toGeometry(c: Cloud): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(c.position, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(c.color, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(c.size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(c.phase, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(c.alpha, 1));
  g.computeBoundingSphere();
  return g;
}

function makeDotTexture(): THREE.CanvasTexture {
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for sphere sprite');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.16, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.34, 'rgba(255,255,255,0.38)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec2 uMouse;
  uniform float uHover;
  uniform float uTwinkle;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aPhase;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec4 clip = projectionMatrix * mv;
    vec2 ndc = clip.xy / clip.w;
    float d = length(ndc - uMouse);
    float fall = 1.0 - smoothstep(0.0, 0.46, d);
    float wave = 0.62 + 0.38 * sin(uTime * 7.0 - d * 24.0);
    float push = fall * uHover * wave;
    if (push > 0.0005) {
      vec3 dir = normalize(p + vec3(0.0001));
      p += dir * push * 0.2;
      mv = modelViewMatrix * vec4(p, 1.0);
      clip = projectionMatrix * mv;
    }
    gl_Position = clip;
    float depth = -mv.z;
    float tw = 1.0 + uTwinkle * 0.32 * sin(uTime * 1.6 + aPhase);
    gl_PointSize = aSize * uPixelRatio * (4.2 / depth) * (1.0 + push * 0.7);
    float fade = mix(1.0, 0.32, clamp((depth - 2.8) / 2.8, 0.0, 1.0));
    vColor = mix(aColor, vec3(1.0), push * 0.4);
    vAlpha = aAlpha * tw * fade * (1.0 + push * 0.6);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

const BASE_RAD_PER_FRAME = 0.003;
/** Frame-rate cap while nothing is interactive (idle auto-rotation + twinkle). */
const IDLE_FPS = 30;
const IDLE_FRAME_MS = 1000 / IDLE_FPS;
const TILT = (22 * Math.PI) / 180;

function ariaLabelFor(counts: SphereCounts): string {
  const parts = SPHERE_GROUPS.flatMap((g) => {
    const c = counts[g.id];
    if (c === 'offline') return [`${g.label.toLowerCase()} offline`];
    return typeof c === 'number' ? [`${formatInt(c)} ${g.label.toLowerCase()}`] : [];
  });
  return parts.length ? `Open Second Brain — ${parts.join(', ')}` : 'Open Second Brain';
}

/**
 * 3D dotted Second Brain built from real counts: white SKILLS core, a lobed shell of vault NOTES (orange)
 * and LTM CAPTURES (cyan), and a 22°-tilted Saturn ring of ROUTINES (amber) and MCP SERVERS (violet).
 * Each group's particle density is log-scaled from its count (draw range eases toward the target).
 * Raw three.js, created in useEffect, fully disposed on unmount. Drag to rotate (with inertia),
 * hover ripples the dots, click opens the Second Brain.
 */
export function SecondBrainSphere3D({ size = 360, speed = 1, reduceMotion = false, href = '/second-brain', onHoverChange, counts, className }: SecondBrainSphere3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  // Memoised by value (countsKey), not by the counts object's identity.
  const countsKey = SPHERE_GROUPS.map((g) => counts?.[g.id] ?? 'x').join('|');
  const fractions = useMemo(() => sphereFractions(counts ?? {}), [countsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const ariaLabel = useMemo(() => ariaLabelFor(counts ?? {}), [countsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live props read by the render loop without re-creating the scene.
  const live = useRef({ speed, reduceMotion, href, onHoverChange, router, fractions });
  useEffect(() => {
    live.current = { speed, reduceMotion, href, onHoverChange, router, fractions };
  }, [speed, reduceMotion, href, onHoverChange, router, fractions]);
  useEffect(() => {
    canvasRef.current?.setAttribute('aria-label', ariaLabel);
  }, [ariaLabel, ready]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (err) {
      console.error('[SecondBrainSphere3D] WebGL unavailable:', err);
      setFailed(true);
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.set(0, 0, 4.2);

    const texture = makeDotTexture();
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: dpr },
        uMouse: { value: new THREE.Vector2(9, 9) },
        uHover: { value: 0 },
        uTwinkle: { value: 1 },
        uMap: { value: texture },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    const rnd = seededRandom(424846);
    const core = buildCore(rnd);
    const shell = buildShell(rnd);
    const rings = buildRing(rnd);
    const geo: Record<SphereGroupId, THREE.BufferGeometry> = {
      skills: toGeometry(core),
      notes: toGeometry(shell.notes),
      captures: toGeometry(shell.captures),
      routines: toGeometry(rings.routines),
      mcp: toGeometry(rings.mcp),
    };
    const dustG = toGeometry(buildDust(rnd));
    const geometries = [...Object.values(geo), dustG];
    // Per-group draw range eases from 0 toward its log-scaled share of the particle budget.
    const groups = SPHERE_GROUPS.map((g) => {
      const total = geo[g.id].getAttribute('position').count;
      geo[g.id].setDrawRange(0, 0);
      return { id: g.id, geo: geo[g.id], total, cur: 0 };
    });

    const root = new THREE.Group(); // user drag rotation
    root.rotation.x = 0.12;
    const body = new THREE.Group(); // auto-rotating core + shell
    body.add(new THREE.Points(geo.skills, material), new THREE.Points(geo.notes, material), new THREE.Points(geo.captures, material));
    const ringTilt = new THREE.Group();
    ringTilt.rotation.set(TILT, 0, -0.26);
    const ring = new THREE.Group();
    ring.add(new THREE.Points(geo.routines, material), new THREE.Points(geo.mcp, material));
    ringTilt.add(ring);
    const dust = new THREE.Points(dustG, material);
    root.add(body, ringTilt, dust);
    scene.add(root);

    // ── interaction state ──
    const drag = { active: false, pointerId: -1, startX: 0, startY: 0, lastX: 0, lastY: 0, moved: 0, startT: 0 };
    const vel = { x: 0, y: 0 };
    let hoverEnergy = 0;
    let hovering = false;
    const mouse = new THREE.Vector2(9, 9);

    const setHover = (h: boolean) => {
      if (h === hovering) return;
      hovering = h;
      live.current.onHoverChange?.(h);
    };

    const toNdc = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag.active = true;
      drag.pointerId = e.pointerId;
      drag.startX = drag.lastX = e.clientX;
      drag.startY = drag.lastY = e.clientY;
      drag.moved = 0;
      drag.startT = performance.now();
      vel.x = vel.y = 0;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    };
    const onMove = (e: PointerEvent) => {
      toNdc(e);
      setHover(true);
      if (!live.current.reduceMotion) hoverEnergy = Math.min(1, hoverEnergy + 0.12);
      if (!drag.active || e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.lastX;
      const dy = e.clientY - drag.lastY;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      vel.y = dx * 0.006;
      vel.x = dy * 0.006;
      root.rotation.y += vel.y;
      root.rotation.x = THREE.MathUtils.clamp(root.rotation.x + vel.x, -0.6, 0.6);
    };
    const onUp = (e: PointerEvent) => {
      if (!drag.active || e.pointerId !== drag.pointerId) return;
      drag.active = false;
      canvas.style.cursor = 'pointer';
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      const isClick = drag.moved < 6 && performance.now() - drag.startT < 600;
      if (isClick) {
        vel.x = vel.y = 0;
        live.current.router.push(live.current.href);
      } else if (live.current.reduceMotion) {
        vel.x = vel.y = 0; // no inertia when motion is reduced
      }
    };
    const onCancel = () => {
      drag.active = false;
      canvas.style.cursor = 'pointer';
    };
    const onLeave = () => {
      if (!drag.active) {
        setHover(false);
        mouse.set(9, 9);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        live.current.router.push(live.current.href);
      }
    };

    canvas.style.cursor = 'pointer';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'link');
    canvas.setAttribute('aria-label', 'Open Second Brain');
    canvasRef.current = canvas;
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('keydown', onKey);

    // ── visibility: no rendering while the canvas is scrolled off-screen (stacked layout below 1280px) ──
    let onScreen = true;
    const io =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            for (const e of entries) onScreen = e.isIntersecting;
          });
    io?.observe(host);

    // ── render loop (frame-rate independent: 1 "frame" = 1/60 s) ──
    // Full rate only while something is interactive (pointer over/dragging, inertia, hover glow, particle
    // counts easing). Idle auto-rotation is capped at IDLE_FPS; with reduced motion an idle frame is
    // identical to the last one, so nothing is drawn until something changes.
    let raf = 0;
    let last = performance.now();
    let time = 0;
    let idleDrawn = false; // reduced motion: the settled frame is already on screen
    const u = material.uniforms;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!onScreen) {
        last = now; // resume without a catch-up jump
        return;
      }
      const { speed: spd, reduceMotion: rm, fractions: fr } = live.current;
      const easing = groups.some((g) => g.cur !== fr[g.id] * g.total);
      const settled =
        !drag.active &&
        !hovering &&
        !easing &&
        hoverEnergy < 1e-3 &&
        Math.abs(vel.x) <= 1e-5 &&
        Math.abs(vel.y) <= 1e-5 &&
        Math.abs(0.12 - root.rotation.x) < 1e-4;
      if (!settled) idleDrawn = false;
      else if (rm ? idleDrawn : now - last < IDLE_FRAME_MS - 2) return;
      const f = Math.min(4, (now - last) / (1000 / 60));
      last = now;
      const ease = 1 - Math.pow(0.93, f);
      for (const g of groups) {
        const target = fr[g.id] * g.total;
        g.cur = rm ? target : Math.abs(target - g.cur) < 1 ? target : g.cur + (target - g.cur) * ease;
        g.geo.setDrawRange(0, Math.round(g.cur));
      }

      if (!rm) {
        time += f / 60;
        body.rotation.y += BASE_RAD_PER_FRAME * spd * f;
        ring.rotation.y -= BASE_RAD_PER_FRAME * 0.55 * spd * f;
        dust.rotation.y += BASE_RAD_PER_FRAME * 0.3 * spd * f;
      }
      if (!drag.active) {
        const decay = Math.pow(0.94, f);
        vel.x *= decay;
        vel.y *= decay;
        if (Math.abs(vel.y) > 1e-5 || Math.abs(vel.x) > 1e-5) {
          root.rotation.y += vel.y * f;
          root.rotation.x = THREE.MathUtils.clamp(root.rotation.x + vel.x * f, -0.6, 0.6);
        }
        // ease back toward the resting tilt once inertia fades
        root.rotation.x += (0.12 - root.rotation.x) * (1 - Math.pow(0.985, f));
      }
      hoverEnergy *= Math.pow(rm ? 0.8 : 0.955, f);
      u.uTime.value = time;
      u.uHover.value = rm ? 0 : hoverEnergy;
      u.uTwinkle.value = rm ? 0 : 1;
      (u.uMouse.value as THREE.Vector2).copy(mouse);
      renderer.render(scene, camera);
      if (settled && rm) idleDrawn = true;
    };
    raf = requestAnimationFrame(tick);
    setReady(true);

    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('keydown', onKey);
      geometries.forEach((g) => g.dispose());
      material.dispose();
      texture.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      canvasRef.current = null;
      if (hovering) live.current.onHoverChange?.(false);
    };
  }, [size]);

  return (
    <div
      className={cn('relative overflow-hidden rounded-full', className)}
      style={{ width: size, height: size }}
    >
      <div ref={hostRef} className={cn('absolute inset-0 transition-opacity duration-700', ready ? 'opacity-100' : 'opacity-0')} />
      {failed && (
        <button
          type="button"
          onClick={() => router.push(href)}
          aria-label="Open Second Brain"
          className="absolute inset-0 rounded-full [background-image:radial-gradient(rgba(245,242,235,0.55)_1px,transparent_1.5px)] [background-size:9px_9px] [mask-image:radial-gradient(circle,black_30%,transparent_68%)]"
        />
      )}
    </div>
  );
}

export default SecondBrainSphere3D;
