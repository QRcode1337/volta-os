'use client';

// VOLTA Editor — Edit mode viewer. Draws the sequence at the playhead exactly as src/lib/nle/model.ts defines it
// (layersAt → transitionFx / transformAt / textAnimAt / fittedSize / cssFilter), owns the master clock, keeps a pool of
// <video> / <audio> elements in sync with it, and lets the user move / scale / rotate / retype layers on the canvas.
import { AlertTriangle, Clapperboard, Grid3x3, Loader2, Maximize2, Minimize2, Scan, Upload } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import {
  DEFAULT_TEXT,
  DEFAULT_TEXT_SEC,
  EPS,
  FORMATS,
  IDENTITY,
  baseClip,
  clipEnd,
  clipFromAsset,
  fmtTC,
  gainAt,
  layersAt,
  mainTrackId,
  sequenceDuration,
  sourceTime,
} from '@/lib/nle/model';
import type { NleClip, NleSequence, NleTransform } from '@/types/nle';
import { clearDrag, isOurDrag, readDrop, type DndPreset } from './dnd';
import { LayerView } from './preview/Layer';
import { TransformHandles, type HandleKind } from './preview/TransformHandles';
import { Transport } from './preview/Transport';
import { hitsBox, layerGeom, type LayerGeom } from './preview/geometry';
import { useAudioMix } from './preview/useAudioMix';
import { useClock } from './preview/useClock';
import { useMediaPool, type MediaEntry } from './preview/useMediaPool';
import type { NleAction, NleState } from './state';

export interface NlePreviewProps {
  state: NleState;
  dispatch: React.Dispatch<NleAction>;
  onDropFiles: (files: File[], at: { t: number; trackId: string | null }) => void;
  className?: string;
}

type Zoom = 'fit' | 0.5 | 1;

/** Seconds ahead an upcoming clip's element is created and primed on its in-point. */
const LOOKAHEAD = 2;
/** Centre-line snap distance (display px). */
const SNAP_PX = 6;
const PAD = 12;
const GUIDE = '#FF2BD6';

interface CanvasDrag {
  kind: HandleKind;
  id: string;
  field: 'transform' | 'transformEnd';
  start: NleTransform;
  p0: { x: number; y: number };
  c: { x: number; y: number };
  d0: number;
  lastA: number;
  acc: number;
  pointerId: number;
  moved: boolean;
}

const deg = (rad: number) => (rad * 180) / Math.PI;
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

/** Every clip start / end (plus 0), sorted and de-duplicated to the millisecond. */
function editPoints(seq: NleSequence): number[] {
  const s = new Set<number>([0]);
  for (const c of seq.clips) {
    s.add(Math.round(c.start * 1000) / 1000);
    s.add(Math.round(clipEnd(c) * 1000) / 1000);
  }
  return [...s].sort((a, b) => a - b);
}

/** Track for a dropped text / colour preset: the top video track when it is a free, visible, unlocked overlay track. */
function overlayTrackFor(seq: NleSequence, a: number, b: number): string | null {
  const main = mainTrackId(seq);
  const top = seq.tracks.find((t) => t.kind === 'video');
  if (!top || top.id === main || top.locked || top.hidden) return null;
  const busy = seq.clips.some((c) => c.trackId === top.id && c.start < b - EPS && clipEnd(c) > a + EPS);
  return busy ? null : top.id;
}

function HeadBtn({ title, active, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-1.5 font-mono text-[10px] font-semibold transition-colors',
        active ? 'border-orange/70 bg-orange/15 text-orange' : 'border-subtle bg-panel-elevated text-secondary hover:border-highlight hover:text-paper',
      )}
    >
      {children}
    </button>
  );
}

const selectCls = 'h-6 rounded-md border border-subtle bg-panel-elevated px-1 font-mono text-[10px] text-paper outline-none hover:border-highlight';

export function NlePreview({ state, dispatch, onDropFiles, className }: NlePreviewProps) {
  const { seq, playhead, playing, selection } = state;
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [showSafe, setShowSafe] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [loop, setLoop] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  /** clip id → src that failed to load (badge shows while the clip still points at that src). */
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [guides, setGuides] = useState({ v: false, h: false });
  const [measured, setMeasured] = useState<Record<string, { w: number; h: number }>>({});
  const dragRef = useRef<CanvasDrag | null>(null);
  const seqRef = useRef(seq);
  const innerEls = useRef(new Map<string, HTMLDivElement>());
  const innerRefCbs = useRef(new Map<string, (el: HTMLDivElement | null) => void>());

  const mix = useAudioMix();
  const pool = useMediaPool(mix);

  useLayoutEffect(() => {
    seqRef.current = seq;
  });

  // ── stage size ──
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage((o) => (o.w === el.clientWidth && o.h === el.clientHeight ? o : { w: el.clientWidth, h: el.clientHeight }));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const on = () => setFullscreen(!!sectionRef.current && document.fullscreenElement === sectionRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  // ── frame geometry ──
  const W = Math.max(1, seq.width);
  const H = Math.max(1, seq.height);
  const aspect = W / H;
  let fw: number;
  let fh: number;
  if (zoom === 'fit') {
    const availW = Math.max(0, stage.w - PAD * 2);
    const availH = Math.max(0, stage.h - PAD * 2);
    fw = Math.min(availW, availH * aspect);
    fh = fw / aspect;
  } else {
    fw = W * zoom;
    fh = H * zoom;
  }
  fw = Math.max(0, Math.floor(fw));
  fh = Math.max(0, Math.floor(fh));
  const k = fw / W;
  const innerW = Math.max(stage.w, fw + PAD * 2);
  const innerH = Math.max(stage.h, fh + PAD * 2);
  const frameLeft = Math.floor((innerW - fw) / 2);
  const frameTop = Math.floor((innerH - fh) / 2);

  const fps = seq.fps || 30;
  const dur = sequenceDuration(seq);
  // the end is exclusive: parked on (or past) the end, show the last frame instead of an empty frame
  const tView = dur > 0 && playhead >= dur - EPS ? Math.max(0, dur - 0.5 / fps) : playhead;

  const tracks = useMemo(() => new Map(seq.tracks.map((t) => [t.id, t])), [seq.tracks]);
  const layers = useMemo(() => layersAt(seq, tView), [seq, tView]);
  const geoms = useMemo(() => (fw > 0 ? layers.map((l) => layerGeom(l, seq, tView, fw, fh)) : []), [layers, seq, tView, fw, fh]);
  const geomById = useMemo(() => {
    const m = new Map<string, { g: LayerGeom; z: number }>();
    geoms.forEach((g, i) => m.set(g.clip.id, { g, z: i + 1 }));
    return m;
  }, [geoms]);

  // ── pools: current layers + upcoming visual clips (stable DOM order = seq.clips order) and audio clips ──
  const visualClips = useMemo(
    () =>
      seq.clips.filter((c) => {
        if (geomById.has(c.id)) return true;
        if ((c.kind !== 'video' && c.kind !== 'image') || !c.src) return false;
        const tr = tracks.get(c.trackId);
        if (!tr || tr.hidden || tr.kind !== 'video') return false;
        return c.start > tView && c.start - tView <= LOOKAHEAD;
      }),
    [seq.clips, geomById, tracks, tView],
  );
  const audioClips = useMemo(
    () =>
      seq.clips.filter((c) => {
        if (c.kind !== 'audio' || !c.src || c.muted) return false;
        const tr = tracks.get(c.trackId);
        if (!tr || tr.hidden || tr.muted) return false;
        const active = tView >= c.start - EPS && tView < clipEnd(c) - EPS;
        return active || (c.start > tView && c.start - tView <= LOOKAHEAD);
      }),
    [seq.clips, tracks, tView],
  );

  const entries: MediaEntry[] = [];
  for (const c of visualClips) {
    if (c.kind !== 'video') continue;
    const g = geomById.get(c.id)?.g ?? null;
    const inRange = tView >= c.start - EPS && tView < clipEnd(c) - EPS;
    const tr = tracks.get(c.trackId);
    const audible = !!g && !g.outgoing && inRange && c.hasAudio && !c.muted && !tr?.muted;
    entries.push({ id: c.id, clip: c, target: sourceTime(c, g ? tView : c.start), active: !!g, gain: audible ? gainAt(c, tView) : 0 });
  }
  for (const c of audioClips) {
    const active = tView >= c.start - EPS && tView < clipEnd(c) - EPS;
    entries.push({ id: c.id, clip: c, target: sourceTime(c, active ? tView : c.start), active, gain: active ? gainAt(c, tView) : 0 });
  }

  // sync every render (each TICK / SEEK re-renders): cheap, idempotent
  useEffect(() => {
    pool.sync(entries, playing);
  });

  useEffect(() => {
    if (playing) mix.ensure();
  }, [playing, mix]);

  useClock({ playing, dispatch, isStalled: pool.isStalled, onBuffering: setBuffering, loop, playhead, duration: dur });

  // ── measured text boxes (text layers are auto-sized) ──
  useLayoutEffect(() => {
    let next: Record<string, { w: number; h: number }> | null = null;
    for (const g of geoms) {
      if (g.clip.kind !== 'text') continue;
      const el = innerEls.current.get(g.clip.id);
      if (!el) continue;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const old = (next ?? measured)[g.clip.id];
      if (!old || Math.abs(old.w - w) > 0.5 || Math.abs(old.h - h) > 0.5) {
        next = { ...(next ?? measured), [g.clip.id]: { w, h } };
      }
    }
    if (next) setMeasured(next);
  });

  const innerRef = useCallback((id: string) => {
    let cb = innerRefCbs.current.get(id);
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        if (el) innerEls.current.set(id, el);
        else innerEls.current.delete(id);
      };
      innerRefCbs.current.set(id, cb);
    }
    return cb;
  }, []);

  const boxOf = useCallback(
    (g: LayerGeom): { w: number; h: number } => {
      if (g.w != null && g.h != null) return { w: g.w, h: g.h };
      const m = measured[g.clip.id];
      if (m) return m;
      const el = innerEls.current.get(g.clip.id);
      return { w: el?.offsetWidth ?? 0, h: el?.offsetHeight ?? 0 };
    },
    [measured],
  );

  const hitTest = useCallback(
    (x: number, y: number, only?: (g: LayerGeom) => boolean): LayerGeom | null => {
      for (let i = geoms.length - 1; i >= 0; i--) {
        const g = geoms[i];
        if (only && !only(g)) continue;
        const b = boxOf(g);
        if (hitsBox(g, b.w, b.h, x, y, 2)) return g;
      }
      return null;
    },
    [geoms, boxOf],
  );

  // selected visual layer shown with handles: topmost current (non-held) layer in the selection
  const selGeom = useMemo(() => {
    const sel = new Set(selection);
    for (let i = geoms.length - 1; i >= 0; i--) if (!geoms[i].outgoing && sel.has(geoms[i].clip.id)) return geoms[i];
    return null;
  }, [geoms, selection]);

  // ── media errors ──
  const onMediaError = useCallback(
    (id: string) => {
      pool.markError(id);
      const c = seqRef.current.clips.find((x) => x.id === id);
      setErrors((e) => (c?.src && e[id] !== c.src ? { ...e, [id]: c.src } : e));
    },
    [pool],
  );
  const onMediaOk = useCallback(
    (id: string) => {
      pool.clearError(id);
      setErrors((e) => {
        if (!(id in e)) return e;
        const n = { ...e };
        delete n[id];
        return n;
      });
    },
    [pool],
  );

  // ── inline text editing ──
  const onTextDone = useCallback(
    (id: string, content: string | null) => {
      setEditingId((cur) => (cur === id ? null : cur));
      if (content == null) return;
      const c = seqRef.current.clips.find((x) => x.id === id);
      if (!c?.text || c.text.content === content) return;
      dispatch({ type: 'UPDATE_CLIPS', ids: [id], patch: { text: { ...c.text, content } } });
    },
    [dispatch],
  );
  // the clip being edited left the picture (seek / undo / delete): close the editor
  useEffect(() => {
    if (editingId && !geomById.has(editingId)) setEditingId(null);
  }, [editingId, geomById]);

  // ── transport ──
  const togglePlay = useCallback(() => {
    mix.ensure();
    dispatch({ type: 'TOGGLE_PLAY' });
  }, [dispatch, mix]);
  const seek = useCallback((t: number) => dispatch({ type: 'SEEK', t }), [dispatch]);
  const prevEdit = () => {
    const pts = editPoints(seq).filter((p) => p < playhead - 0.5 / fps);
    seek(pts.length ? pts[pts.length - 1] : 0);
  };
  const nextEdit = () => {
    const p = editPoints(seq).find((x) => x > playhead + 0.5 / fps);
    seek(p ?? dur);
  };

  const toggleFullscreen = () => {
    const el = sectionRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else el.requestFullscreen?.().catch(() => undefined);
  };

  // ── canvas pointer: select / move / scale / rotate ──
  const toFrame = (e: { clientX: number; clientY: number }) => {
    const r = frameRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };

  const onFramePointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    mix.ensure();
    if (editingId) {
      // clicking away commits the inline edit (blur, or the editor's unmount when it no longer has focus)
      (document.activeElement as HTMLElement | null)?.blur?.();
      setEditingId(null);
      return;
    }
    const pt = toFrame(e);
    const handle = ((e.target as HTMLElement).closest('[data-handle]')?.getAttribute('data-handle') ?? null) as HandleKind | null;
    let g: LayerGeom | null = null;
    if (handle && selGeom) g = selGeom;
    else {
      g = hitTest(pt.x, pt.y);
      if (!g) {
        if (selection.length) dispatch({ type: 'SELECT', ids: [] });
        return;
      }
      if (e.shiftKey || e.metaKey) {
        dispatch({ type: 'SELECT', ids: [g.clip.id], additive: true });
        return;
      }
      if (selection.length !== 1 || selection[0] !== g.clip.id) dispatch({ type: 'SELECT', ids: [g.clip.id] });
    }
    if (g.outgoing || tracks.get(g.clip.trackId)?.locked) return;
    const c = g.clip;
    const field: CanvasDrag['field'] = c.transformEnd && tView > c.start + c.duration / 2 ? 'transformEnd' : 'transform';
    const start = (field === 'transformEnd' ? c.transformEnd : c.transform) ?? IDENTITY;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: handle ?? 'move',
      id: c.id,
      field,
      start: { ...start },
      p0: pt,
      c: { x: g.cx, y: g.cy },
      d0: Math.max(4, Math.hypot(pt.x - g.cx, pt.y - g.cy)),
      lastA: deg(Math.atan2(pt.y - g.cy, pt.x - g.cx)),
      acc: 0,
      pointerId: e.pointerId,
      moved: false,
    };
  };

  const onFramePointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId || fw <= 0) return;
    const pt = toFrame(e);
    if (!d.moved && Math.hypot(pt.x - d.p0.x, pt.y - d.p0.y) < 2) return;
    d.moved = true;
    let next: NleTransform = d.start;
    let key = 'canvas-move';
    if (d.kind === 'move') {
      let x = d.start.x + (pt.x - d.p0.x) / fw;
      let y = d.start.y + (pt.y - d.p0.y) / fh;
      const sv = !e.altKey && Math.abs(x * fw) <= SNAP_PX;
      const sh = !e.altKey && Math.abs(y * fh) <= SNAP_PX;
      if (sv) x = 0;
      if (sh) y = 0;
      if (sv !== guides.v || sh !== guides.h) setGuides({ v: sv, h: sh });
      next = { ...d.start, x, y };
    } else if (d.kind === 'rotate') {
      key = 'canvas-rotate';
      const a = deg(Math.atan2(pt.y - d.c.y, pt.x - d.c.x));
      d.acc += wrap180(a - d.lastA);
      d.lastA = a;
      let r = d.start.rotation + d.acc;
      if (e.shiftKey) r = Math.round(r / 15) * 15;
      next = { ...d.start, rotation: Math.round(r * 100) / 100 };
    } else {
      key = 'canvas-scale';
      const dist = Math.hypot(pt.x - d.c.x, pt.y - d.c.y);
      const s = Math.max(0.02, Math.min(20, (d.start.scale * dist) / d.d0));
      next = { ...d.start, scale: Math.round(s * 10000) / 10000 };
    }
    dispatch({ type: 'UPDATE_CLIPS', ids: [d.id], patch: d.field === 'transformEnd' ? { transformEnd: next } : { transform: next }, key });
  };

  const endDrag = (e: RPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (guides.v || guides.h) setGuides({ v: false, h: false });
  };

  const onFrameDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const pt = toFrame(e);
    const isText = (g: LayerGeom) => g.clip.kind === 'text' && !g.outgoing;
    const g = selGeom && isText(selGeom) && hitsBox(selGeom, boxOf(selGeom).w, boxOf(selGeom).h, pt.x, pt.y, 4) ? selGeom : hitTest(pt.x, pt.y, isText);
    if (!g || tracks.get(g.clip.trackId)?.locked) return;
    if (playing) dispatch({ type: 'SET_PLAYING', playing: false });
    if (selection.length !== 1 || selection[0] !== g.clip.id) dispatch({ type: 'SELECT', ids: [g.clip.id] });
    setEditingId(g.clip.id);
  };

  // ── drop target ──
  const onDragOver = (e: React.DragEvent) => {
    if (!isOurDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!dragOver) setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
  };
  const applyPreset = (p: DndPreset, t: number) => {
    if (p.kind === 'transition') {
      const sel = seq.clips.find((c) => selection.includes(c.id) && c.kind !== 'audio');
      const main = mainTrackId(seq);
      const target = sel ?? seq.clips.find((c) => c.trackId === main && t >= c.start - EPS && t < clipEnd(c) - EPS);
      if (target) dispatch({ type: 'SET_TRANSITION', id: target.id, transition: { type: p.type, duration: p.duration } });
      return;
    }
    let clip: NleClip;
    if (p.kind === 'text') {
      const d = p.duration > 0 ? p.duration : DEFAULT_TEXT_SEC;
      clip = baseClip('text', { name: p.label, duration: d, text: { ...DEFAULT_TEXT, ...p.style }, transform: { ...IDENTITY, ...p.transform } });
    } else {
      clip = baseClip('color', { name: p.label, color: p.color, ...(p.duration > 0 ? { duration: p.duration } : {}) });
    }
    const track = overlayTrackFor(seq, t, t + clip.duration);
    dispatch({ type: 'ADD_CLIPS', clips: [clip], trackId: track ?? { newTrack: 'video', position: 'top' }, start: t });
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const d = readDrop(e);
    clearDrag();
    if (!d) return;
    const t = Math.min(playhead, dur);
    if ('asset' in d) dispatch({ type: 'ADD_CLIPS', clips: [clipFromAsset(d.asset)], trackId: null, start: t });
    else if ('preset' in d) applyPreset(d.preset, t);
    else onDropFiles(d.files, { t, trackId: null });
  };

  const formatId = FORMATS.find((f) => f.width === seq.width && f.height === seq.height)?.id ?? 'custom';
  const empty = seq.clips.length === 0;
  const errorList = Object.entries(errors).filter(([id, src]) => seq.clips.some((c) => c.id === id && c.src === src));
  const selBox = selGeom ? boxOf(selGeom) : null;
  const selLocked = selGeom ? !!tracks.get(selGeom.clip.trackId)?.locked : false;
  const selEditingEnd = !!selGeom?.clip.transformEnd && tView > selGeom.clip.start + selGeom.clip.duration / 2;

  return (
    <section
      ref={sectionRef}
      className={cn('hud-card flex min-h-0 min-w-0 flex-col overflow-hidden', fullscreen && 'rounded-none', className)}
      onPointerDownCapture={() => mix.ensure()}
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-subtle px-3">
        <Clapperboard size={14} className="shrink-0 text-orange" />
        <h2 className="hud-label min-w-0 truncate" title={seq.name}>
          {seq.name}
        </h2>
        <span className="hidden shrink-0 rounded bg-teal/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-teal sm:inline">
          {seq.width}×{seq.height} · {Math.round(fps)}FPS
        </span>
        {errorList.length > 0 && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded bg-[#EF4444]/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#EF4444]"
            title={`Could not load: ${errorList.map(([id]) => seq.clips.find((c) => c.id === id)?.name ?? id).join(', ')}`}
          >
            <AlertTriangle size={10} /> {errorList.length} OFFLINE
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <select
            aria-label="Sequence format"
            title="Sequence format"
            value={formatId}
            onChange={(e) => {
              const f = FORMATS.find((x) => x.id === e.target.value);
              if (f) dispatch({ type: 'SET_SEQ_PROPS', patch: { width: f.width, height: f.height } });
            }}
            className={selectCls}
          >
            {formatId === 'custom' && (
              <option value="custom" className="bg-panel">
                {seq.width}×{seq.height}
              </option>
            )}
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id} className="bg-panel">
                {f.label}
              </option>
            ))}
          </select>
          <select aria-label="Viewer zoom" title="Viewer zoom" value={String(zoom)} onChange={(e) => setZoom(e.target.value === 'fit' ? 'fit' : (Number(e.target.value) as 0.5 | 1))} className={selectCls}>
            <option value="fit" className="bg-panel">
              Fit
            </option>
            <option value="0.5" className="bg-panel">
              50%
            </option>
            <option value="1" className="bg-panel">
              100%
            </option>
          </select>
          <HeadBtn title="Safe-area guides (action 90% / title 80%)" active={showSafe} onClick={() => setShowSafe((v) => !v)}>
            <Scan size={12} />
          </HeadBtn>
          <HeadBtn title="Rule-of-thirds grid" active={showGrid} onClick={() => setShowGrid((v) => !v)}>
            <Grid3x3 size={12} />
          </HeadBtn>
          <HeadBtn title={fullscreen ? 'Exit full screen' : 'Full screen'} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </HeadBtn>
        </div>
      </header>

      <div
        ref={stageRef}
        className={cn('relative min-h-0 flex-1 bg-[#060606]', zoom === 'fit' ? 'overflow-hidden' : 'overflow-auto')}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget && e.target !== e.currentTarget.firstElementChild) return;
          if (editingId) {
            (document.activeElement as HTMLElement | null)?.blur?.();
            setEditingId(null);
          } else if (selection.length) dispatch({ type: 'SELECT', ids: [] });
        }}
      >
        <div className="relative" style={{ width: innerW, height: innerH }}>
          {fw > 0 && fh > 0 && (
            <div
              ref={frameRef}
              className="absolute select-none"
              style={{ left: frameLeft, top: frameTop, width: fw, height: fh, touchAction: 'none' }}
              onPointerDown={onFramePointerDown}
              onPointerMove={onFramePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onLostPointerCapture={endDrag}
              onDoubleClick={onFrameDoubleClick}
            >
              {/* the picture (clipped to the frame) */}
              <div className="absolute inset-0 overflow-hidden rounded-[2px] ring-1 ring-subtle" style={{ background: seq.background || '#000000', isolation: 'isolate' }}>
                {visualClips.map((c) => {
                  const hit = geomById.get(c.id);
                  return (
                    <LayerView
                      key={c.id}
                      clip={c}
                      geom={hit?.g ?? null}
                      z={hit?.z ?? 0}
                      fw={fw}
                      fh={fh}
                      k={k}
                      mediaRef={c.kind === 'video' ? pool.ref(c.id) : undefined}
                      innerRef={innerRef(c.id)}
                      error={!!errors[c.id] && errors[c.id] === c.src}
                      onMediaError={onMediaError}
                      onMediaOk={onMediaOk}
                      onSeeked={pool.onSeeked}
                      editing={editingId === c.id}
                      onTextDone={onTextDone}
                    />
                  );
                })}
              </div>

              {/* overlays */}
              <div className="pointer-events-none absolute inset-0">
                {showGrid && (
                  <>
                    {[1 / 3, 2 / 3].map((f) => (
                      <div key={`v${f}`} className="absolute inset-y-0 w-px bg-white/30" style={{ left: `${f * 100}%` }} />
                    ))}
                    {[1 / 3, 2 / 3].map((f) => (
                      <div key={`h${f}`} className="absolute inset-x-0 h-px bg-white/30" style={{ top: `${f * 100}%` }} />
                    ))}
                  </>
                )}
                {showSafe && (
                  <>
                    <div className="absolute border border-dashed border-teal/70" style={{ left: '5%', top: '5%', right: '5%', bottom: '5%' }}>
                      <span className="absolute left-1 top-0.5 font-mono text-[8px] text-teal/80">ACTION 90%</span>
                    </div>
                    <div className="absolute border border-dashed border-amber/70" style={{ left: '10%', top: '10%', right: '10%', bottom: '10%' }}>
                      <span className="absolute left-1 top-0.5 font-mono text-[8px] text-amber/80">TITLE 80%</span>
                    </div>
                  </>
                )}
                {guides.v && <div className="absolute inset-y-0 w-px" style={{ left: fw / 2, background: GUIDE, boxShadow: `0 0 4px ${GUIDE}` }} />}
                {guides.h && <div className="absolute inset-x-0 h-px" style={{ top: fh / 2, background: GUIDE, boxShadow: `0 0 4px ${GUIDE}` }} />}
              </div>

              {selGeom && selBox && !editingId && (
                <TransformHandles
                  cx={selGeom.cx}
                  cy={selGeom.cy}
                  w={selBox.w * selGeom.s}
                  h={selBox.h * selGeom.s}
                  rot={selGeom.rot}
                  locked={selLocked}
                  editingEnd={selEditingEnd}
                  label={selGeom.clip.name}
                />
              )}

              {buffering && (
                <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 font-mono text-[9px] font-bold text-paper">
                  <Loader2 size={11} className="animate-spin text-orange" /> BUFFERING
                </div>
              )}

              {empty && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center font-mono text-xs text-muted">
                  <Upload size={26} className="text-orange/70" />
                  <div className="text-[13px] text-secondary">Drag clips from Media, or drop files here</div>
                  <div className="max-w-sm text-[10px] leading-relaxed">Videos, images and audio land at the playhead. Text and colour presets go on an overlay track.</div>
                </div>
              )}
            </div>
          )}
        </div>

        {dragOver && (
          <div className="pointer-events-none absolute inset-2 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-orange bg-orange/10">
            <span className="rounded-md bg-obsidian/90 px-3 py-1.5 font-mono text-[11px] font-bold text-orange">Drop to add at {fmtTC(Math.min(playhead, dur), fps)}</span>
          </div>
        )}

        {/* pooled audio elements (audio clips are not layers) */}
        <div className="hidden" aria-hidden>
          {audioClips.map((c) => (
            <audio key={c.id} ref={pool.ref(c.id)} src={c.src ?? undefined} preload="auto" muted onSeeked={(e) => pool.onSeeked(e.currentTarget)} onError={() => onMediaError(c.id)} onLoadedData={() => onMediaOk(c.id)} />
          ))}
        </div>
      </div>

      <Transport
        playhead={playhead}
        total={dur}
        fps={fps}
        playing={playing}
        loop={loop}
        buffering={buffering}
        onTogglePlay={togglePlay}
        onSeek={seek}
        onStep={(frames) => dispatch({ type: 'STEP', frames })}
        onPrevEdit={prevEdit}
        onNextEdit={nextEdit}
        onLoop={() => setLoop((v) => !v)}
      />
    </section>
  );
}
