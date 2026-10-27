'use client';
// VOLTA Editor — Edit mode timeline (CapCut / Final Cut style). Every edit is a dispatch to nleReducer; this component owns
// only transient interaction state (drags, drop ghosts, menus). Clip rows are memoised and the playhead is its own tiny
// component, so playback ticks do not re-render clips.
import { ArrowLeftToLine, ClipboardPaste, Copy, CopyPlus, Delete, Flag, Gauge, Scissors, Sparkles, Trash2, Unlink, Upload, AudioLines, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type DragEvent as RDragEvent, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react';
import { cn } from '@/lib/cn';
import { DEFAULT_TEXT, IDENTITY, baseClip, clamp, clipEnd, clipFromAsset, fmtShort, fmtTC, frameSnap, mainTrackId, sequenceDuration, trackClips, uid } from '@/lib/nle/model';
import type { NleClip, NleClipKind, NleSequence, NleTrack, NleTrackKind, NleTransitionType } from '@/types/nle';
import { DND_ASSET, DND_PRESET, clearDrag, currentDrag, isOurDrag, readDrop, type DndAsset, type DndPreset } from './dnd';
import { snapNear, snapPoints, withLinked, type NewTrackTarget, type NleAction, type NleState } from './state';
import { ClipView } from './timeline/ClipView';
import { ContextMenu, type MenuItem } from './timeline/ContextMenu';
import { AUDIO_H, BOTTOM_ZONE, DRAG_THRESHOLD, HEADER_W, KIND_STYLE, MAX_PPS, MIN_PPS, RULER_H, SNAP_YELLOW, TAIL_SEC, TOP_ZONE, trackHeight, trackKindFor } from './timeline/constants';
import { PlayheadHead, PlayheadLine, PlayheadTC } from './timeline/Playhead';
import { Ruler } from './timeline/Ruler';
import { Toolbar, type ToolbarCmd } from './timeline/Toolbar';
import { TrackHeader } from './timeline/TrackHeader';

export interface NleTimelineProps {
  state: NleState;
  dispatch: Dispatch<NleAction>;
  onDropFiles: (files: File[], at: { t: number; trackId: string | NewTrackTarget | null }) => void;
  className?: string;
}

type Target = string | NewTrackTarget | null;
type Zone = 'top' | 'bottom';

interface Row {
  track: NleTrack;
  top: number;
  h: number;
}

interface Ghost {
  key: string;
  x: number;
  w: number;
  y: number;
  h: number;
  kind: NleClipKind;
  name: string;
}

interface Overlay {
  ghosts?: Ghost[];
  zone?: Zone | null;
  zoneKind?: NleTrackKind;
  snapT?: number | null;
  insert?: { x: number; y: number; h: number } | null;
  marquee?: { x: number; y: number; w: number; h: number } | null;
  trimId?: string;
  trimRipple?: boolean;
  moving?: Set<string>;
  alt?: boolean;
}

interface DropHint {
  t: number;
  len: number;
  label: string;
  clipKind: NleClipKind | null;
  /** Row the ghost is drawn on (null when zone is set). */
  rowId: string | null;
  zone: Zone | null;
  target: Target;
  snapT: number | null;
  insertX: number | null;
  transitionClipId?: string;
  trDur?: number;
  invalid?: boolean;
}

type Drag =
  | { kind: 'move'; pid: number; x0: number; y0: number; started: boolean; anchorId: string; ids: string[]; moving: string[]; collapseTo: string | null; last: MoveResult | null }
  | { kind: 'trim'; pid: number; x0: number; y0: number; started: boolean; id: string; edge: 'start' | 'end'; origDur: number; origEdge: number; lastT: number | null; lastRipple: boolean; waitSeq: NleSequence | null; waitAt: number; pending: { x: number; shift: boolean } | null }
  | { kind: 'fade'; pid: number; x0: number; y0: number; started: boolean; id: string; which: 'in' | 'out' }
  | { kind: 'transition'; pid: number; x0: number; y0: number; started: boolean; id: string; edge: boolean }
  | { kind: 'marquee'; pid: number; x0: number; y0: number; started: boolean; additive: boolean; base: string[]; lastKey: string }
  | { kind: 'scrub'; pid: number; x0: number; y0: number; started: boolean }
  | { kind: 'marker'; pid: number; x0: number; y0: number; started: boolean; id: string; t0: number };

interface MoveResult {
  dt: number;
  destId: string | null;
  zone: Zone | null;
  insertStart: number | null;
  ghosts: Ghost[];
  /** Final track (id or 'NEW') per moving clip id. */
  tracks: Map<string, string>;
  snapT: number | null;
}

const byId = (s: NleSequence, id: string | undefined) => (id ? s.clips.find((c) => c.id === id) : undefined);
const trName: Record<'dissolve' | 'dip-black' | 'slide-left', string> = { dissolve: 'Dissolve', 'dip-black': 'Dip to black', 'slide-left': 'Slide left' };

export function NleTimeline({ state, dispatch, onDropFiles, className }: NleTimelineProps) {
  const { seq, pps, selection, playhead, tool } = state;
  const fps = seq.fps || 30;
  const stateRef = useRef(state);
  stateRef.current = state;

  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 900, h: 300 });
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [blade, setBlade] = useState<{ t: number; top: number; h: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [editingMarker, setEditingMarker] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const ptrRef = useRef<{ x: number; y: number; alt: boolean; shift: boolean } | null>(null);
  const rafRef = useRef(0);
  const zoomAnchor = useRef<{ t: number; cx: number } | null>(null);

  // ── layout ──
  const duration = useMemo(() => sequenceDuration(seq), [seq]);
  const mainId = useMemo(() => mainTrackId(seq), [seq]);
  const layout = useMemo(() => {
    let y = TOP_ZONE;
    const rows: Row[] = seq.tracks.map((track) => {
      const h = trackHeight(track.kind);
      const r = { track, top: y, h };
      y += h;
      return r;
    });
    return { rows, total: y, byId: new Map(rows.map((r) => [r.track.id, r])) };
  }, [seq.tracks]);
  const clipsByTrack = useMemo(() => {
    const m = new Map<string, NleClip[]>();
    for (const c of seq.clips) {
      const l = m.get(c.trackId);
      if (l) l.push(c);
      else m.set(c.trackId, [c]);
    }
    return m;
  }, [seq.clips]);
  const selSet = useMemo(() => new Set(selection), [selection]);
  const kindCount = useMemo(() => ({ video: seq.tracks.filter((t) => t.kind === 'video').length, audio: seq.tracks.filter((t) => t.kind === 'audio').length }), [seq.tracks]);
  const lanesW = Math.max(200, view.w - HEADER_W);
  const contentW = Math.max((duration + TAIL_SEC) * pps, lanesW);
  const tracksAreaH = Math.max(layout.total + BOTTOM_ZONE, view.h - RULER_H);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const upd = () => setView((v) => (v.w === el.clientWidth && v.h === el.clientHeight ? v : { w: el.clientWidth, h: el.clientHeight }));
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── zoom ──
  const zoomTo = useCallback((next: number, clientX?: number) => {
    const el = scrollRef.current;
    const st = stateRef.current;
    const p = clamp(next, MIN_PPS, MAX_PPS);
    if (!el || Math.abs(p - st.pps) < 1e-6) return;
    const r = el.getBoundingClientRect();
    const viewW = el.clientWidth - HEADER_W;
    let cx: number;
    if (clientX != null) cx = clamp(clientX - r.left - HEADER_W, 0, viewW);
    else {
      const phx = st.playhead * st.pps - el.scrollLeft;
      cx = phx >= 0 && phx <= viewW ? phx : viewW / 2;
    }
    zoomAnchor.current = { t: (el.scrollLeft + cx) / st.pps, cx };
    dispatch({ type: 'SET_ZOOM', pps: p });
  }, [dispatch]);

  useLayoutEffect(() => {
    const a = zoomAnchor.current;
    const el = scrollRef.current;
    if (!a || !el) return;
    zoomAnchor.current = null;
    el.scrollLeft = Math.max(0, a.t * pps - a.cx);
  }, [pps]);

  const fit = useCallback(() => {
    const el = scrollRef.current;
    const st = stateRef.current;
    if (!el) return;
    const d = sequenceDuration(st.seq);
    const p = clamp(d > 0 ? (el.clientWidth - HEADER_W - 32) / d : 60, MIN_PPS, MAX_PPS);
    if (Math.abs(p - st.pps) < 1e-6) el.scrollLeft = 0;
    else {
      zoomAnchor.current = { t: 0, cx: 0 };
      dispatch({ type: 'SET_ZOOM', pps: p });
    }
  }, [dispatch]);

  useEffect(() => {
    const on = () => fit();
    window.addEventListener('nle:fit', on);
    return () => window.removeEventListener('nle:fit', on);
  }, [fit]);

  // ⌘/Ctrl-wheel (and pinch) zooms around the cursor; plain wheel scrolls horizontally; ⇧-wheel scrolls vertically
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomTo(stateRef.current.pps * Math.exp(-e.deltaY * (e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 10 ? 0.01 : 0.0025)), e.clientX);
      } else if (e.shiftKey) {
        e.preventDefault();
        el.scrollTop += e.deltaY || e.deltaX;
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomTo]);

  // ── geometry helpers ──
  const local = (cx: number, cy: number) => {
    const r = wrapRef.current?.getBoundingClientRect();
    return r ? { x: cx - r.left - HEADER_W, y: cy - r.top } : { x: 0, y: 0 };
  };
  const rowAt = (y: number) => layout.rows.find((r) => y >= r.top && y < r.top + r.h) ?? null;
  const firstUnlocked = (kind: NleTrackKind) => stateRef.current.seq.tracks.find((t) => t.kind === kind && !t.locked)?.id ?? null;
  const unlockedMain = () => {
    const s = stateRef.current.seq;
    const m = mainTrackId(s);
    return m && !s.tracks.find((t) => t.id === m)?.locked ? m : null;
  };

  /** Where a dragged clip of `kind` lands for pointer y (tracks-area coords). */
  const pickTrack = (y: number, kind: NleTrackKind, fallback: string): { id: string | null; zone: Zone | null } => {
    if (y < TOP_ZONE) return kind === 'video' ? { id: null, zone: 'top' } : { id: firstUnlocked('audio') ?? fallback, zone: null };
    if (y >= layout.total) return kind === 'audio' ? { id: null, zone: 'bottom' } : { id: unlockedMain() ?? fallback, zone: null };
    const row = rowAt(y);
    if (!row) return { id: fallback, zone: null };
    if (row.track.kind === kind) return { id: row.track.locked ? fallback : row.track.id, zone: null };
    return { id: (kind === 'video' ? unlockedMain() : firstUnlocked('audio')) ?? fallback, zone: null };
  };

  const zoneRect = (z: Zone) => (z === 'top' ? { y: 1, h: TOP_ZONE - 2 } : { y: layout.total + 4, h: AUDIO_H - 6 });

  /** Magnetic insertion point on the main track for a clip starting at t (reducer rule: other clips sort by midpoint). */
  const mainInsertion = (s: NleSequence, t: number, exclude: Set<string>) => {
    const main = mainTrackId(s);
    if (!main) return 0;
    const others = trackClips(s, main).filter((c) => !exclude.has(c.id));
    const i = others.findIndex((o) => o.start + o.duration / 2 > t);
    return i === -1 ? (others.length ? clipEnd(others[others.length - 1]) : 0) : others[i].start;
  };

  // ── move ──
  const computeMove = (d: Extract<Drag, { kind: 'move' }>, cx: number, cy: number): MoveResult | null => {
    const st = stateRef.current;
    const s = st.seq;
    const anchor = byId(s, d.anchorId);
    if (!anchor) return null;
    const p = local(cx, cy);
    const moving = d.moving.map((id) => byId(s, id)).filter((c): c is NleClip => !!c);
    const movingSet = new Set(d.moving);
    const minStart = Math.min(...moving.map((c) => c.start));
    let dt = Math.max((p.x - d.x0) / st.pps, -minStart);
    let snapT: number | null = null;
    if (st.snap) {
      const pts = snapPoints(st, movingSet);
      const a = anchor.start + dt;
      const b = clipEnd(anchor) + dt;
      const sa = snapNear(a, pts, st.pps);
      const sb = snapNear(b, pts, st.pps);
      if (sa != null && (sb == null || Math.abs(sa - a) <= Math.abs(sb - b))) {
        dt = sa - anchor.start;
        snapT = sa;
      } else if (sb != null) {
        dt = sb - clipEnd(anchor);
        snapT = sb;
      }
      if (dt < -minStart) {
        dt = -minStart;
        snapT = null;
      }
    }
    const kind = trackKindFor(anchor);
    const pick = pickTrack(p.y, kind, anchor.trackId);
    const destKey = pick.zone ? 'NEW' : (pick.id as string);
    const listFor = (k: NleTrackKind) => {
      const l = s.tracks.filter((t) => t.kind === k).map((t) => t.id);
      if (pick.zone && k === kind) return pick.zone === 'top' ? ['NEW', ...l] : [...l, 'NEW'];
      return l;
    };
    const list = listFor(kind);
    const offset = list.indexOf(destKey) - list.indexOf(anchor.trackId);
    const tracks = new Map<string, string>();
    for (const c of moving) {
      const k = trackKindFor(c);
      let tk = c.trackId;
      if (c.id === anchor.id) tk = destKey;
      else if (!(anchor.linkId && c.linkId === anchor.linkId) && k === kind && offset) {
        const l = listFor(k);
        tk = l[clamp(l.indexOf(c.trackId) + offset, 0, l.length - 1)] ?? c.trackId;
      }
      tracks.set(c.id, tk);
    }
    let insertStart: number | null = null;
    if (st.magnetic && kind === 'video' && destKey === mainTrackId(s)) insertStart = mainInsertion(s, anchor.start + dt, movingSet);
    const ghosts: Ghost[] = moving.map((c) => {
      const tk = tracks.get(c.id) ?? c.trackId;
      const r = tk === 'NEW' ? zoneRect(pick.zone ?? 'top') : (() => {
        const row = layout.byId.get(tk);
        return row ? { y: row.top + 3, h: row.h - 6 } : { y: 0, h: 20 };
      })();
      return { key: c.id, x: (c.start + dt) * st.pps, w: Math.max(2, c.duration * st.pps), y: r.y, h: r.h, kind: c.kind, name: c.name };
    });
    return { dt, destId: pick.id, zone: pick.zone, insertStart, ghosts, tracks, snapT };
  };

  const commitMove = (d: Extract<Drag, { kind: 'move' }>, res: MoveResult, alt: boolean) => {
    const st = stateRef.current;
    const s = st.seq;
    const anchor = byId(s, d.anchorId);
    if (!anchor) return;
    const kind = trackKindFor(anchor);
    const toTrack: Target = res.zone ? { newTrack: kind, position: res.zone } : res.destId === anchor.trackId ? null : res.destId;
    if (!alt) {
      if (Math.abs(res.dt) < 1e-6 && toTrack == null) return;
      dispatch({ type: 'MOVE_CLIPS', ids: d.ids, anchorId: anchor.id, dt: res.dt, toTrack });
      return;
    }
    // ⌥-drag: copies land where the ghosts are (same placement rules as a move), as one undo step
    dispatch({ type: 'DUPLICATE', ids: d.ids, dt: res.dt, anchorId: anchor.id, toTrack });
  };

  // ── trim ──
  const runTrim = (d: Extract<Drag, { kind: 'trim' }>, cx: number, shift: boolean) => {
    const st = stateRef.current;
    if (d.waitSeq && st.seq === d.waitSeq && Date.now() - d.waitAt < 150) {
      d.pending = { x: cx, shift };
      return;
    }
    d.pending = null;
    const c = byId(st.seq, d.id);
    if (!c) return;
    const p = local(cx, 0);
    let target = d.origEdge + (p.x - d.x0) / st.pps;
    let snapT: number | null = null;
    if (st.snap) {
      const sn = snapNear(target, snapPoints(st, new Set(withLinked(st.seq, [d.id]))), st.pps);
      if (sn != null) {
        target = sn;
        snapT = sn;
      }
    }
    const delta = target - d.origEdge;
    const t = d.edge === 'start' ? clipEnd(c) - (d.origDur - delta) : c.start + d.origDur + delta;
    setOverlay({ trimId: d.id, trimRipple: shift, snapT });
    const tf = frameSnap(t, st.seq.fps || 30);
    if (tf === d.lastT && shift === d.lastRipple) return;
    d.lastT = tf;
    d.lastRipple = shift;
    d.waitSeq = st.seq;
    d.waitAt = Date.now();
    liveDirty.current = true;
    dispatch({ type: 'TRIM', id: d.id, edge: d.edge, t: tf, ripple: shift || undefined });
  };

  // flush a trim step that arrived before the previous one rendered
  useLayoutEffect(() => {
    const d = dragRef.current;
    if (d?.kind === 'trim' && d.pending) {
      d.waitSeq = null;
      runTrim(d, d.pending.x, d.pending.shift);
    }
  });

  // ── drag lifecycle ──
  const onEscDuringDrag = useRef<(e: KeyboardEvent) => void>(() => {});
  const escHandler = useCallback((e: KeyboardEvent) => onEscDuringDrag.current(e), []);
  /** Live edits (trim / fade / transition / marker) dispatched during this drag — Esc undoes them (one coalesced step). */
  const liveDirty = useRef(false);
  const stopDrag = () => {
    dragRef.current = null;
    ptrRef.current = null;
    liveDirty.current = false;
    cancelAnimationFrame(rafRef.current);
    window.removeEventListener('keydown', escHandler, true);
    setOverlay(null);
  };
  onEscDuringDrag.current = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !dragRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const undo = liveDirty.current;
    stopDrag();
    if (undo) dispatch({ type: 'UNDO' });
  };

  const autoScroll = () => {
    const el = scrollRef.current;
    const ptr = ptrRef.current;
    const d = dragRef.current;
    if (!el || !ptr || !d || !d.started || d.kind === 'fade' || d.kind === 'transition') {
      if (d) rafRef.current = requestAnimationFrame(() => autoScrollRef.current());
      return;
    }
    const r = el.getBoundingClientRect();
    const EDGE = 28;
    let dx = 0;
    let dy = 0;
    if (ptr.x < r.left + HEADER_W + EDGE) dx = -Math.min(24, (r.left + HEADER_W + EDGE - ptr.x) * 0.4);
    else if (ptr.x > r.right - EDGE) dx = Math.min(24, (ptr.x - (r.right - EDGE)) * 0.4);
    if (d.kind === 'move' || d.kind === 'marquee') {
      if (ptr.y < r.top + RULER_H + EDGE && ptr.y > r.top + RULER_H) dy = -8;
      else if (ptr.y > r.bottom - EDGE) dy = 8;
    }
    if (dx || dy) {
      const l0 = el.scrollLeft;
      const t0 = el.scrollTop;
      el.scrollLeft += dx;
      el.scrollTop += dy;
      if (el.scrollLeft !== l0 || el.scrollTop !== t0) handleMoveRef.current(ptr.x, ptr.y, ptr.alt, ptr.shift);
    }
    rafRef.current = requestAnimationFrame(() => autoScrollRef.current());
  };

  // capture only once a drag really starts, so plain clicks / double-clicks keep their real target
  const capture = (pid: number) => {
    try {
      rootRef.current?.setPointerCapture(pid);
    } catch {
      /* pointer already gone */
    }
  };
  const beginDrag = (d: Drag, e: RPointerEvent) => {
    dragRef.current = d;
    liveDirty.current = false;
    ptrRef.current = { x: e.clientX, y: e.clientY, alt: e.altKey, shift: e.shiftKey };
    if (d.started) capture(e.pointerId);
    window.addEventListener('keydown', escHandler, true);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => autoScrollRef.current());
  };

  const handleMove = (cx: number, cy: number, alt: boolean, shift: boolean) => {
    const d = dragRef.current;
    if (!d) return;
    const st = stateRef.current;
    const p = local(cx, cy);
    if (!d.started) {
      if (Math.hypot(p.x - d.x0, p.y - d.y0) < DRAG_THRESHOLD && d.kind !== 'scrub') return;
      d.started = true;
      capture(d.pid);
    }
    switch (d.kind) {
      case 'scrub':
        dispatch({ type: 'SEEK', t: Math.max(0, p.x / st.pps) });
        return;
      case 'move': {
        const res = computeMove(d, cx, cy);
        if (!res) return;
        d.last = res;
        const main = mainTrackId(st.seq);
        const mainRow = main ? layout.byId.get(main) : undefined;
        setOverlay({
          ghosts: res.ghosts,
          zone: res.zone,
          zoneKind: res.zone === 'top' ? 'video' : 'audio',
          snapT: res.snapT,
          insert: res.insertStart != null && mainRow ? { x: res.insertStart * st.pps, y: mainRow.top, h: mainRow.h } : null,
          moving: new Set(d.moving),
          alt,
        });
        return;
      }
      case 'trim':
        runTrim(d, cx, shift);
        return;
      case 'fade': {
        const c = byId(st.seq, d.id);
        if (!c) return;
        const t = p.x / st.pps;
        const v = d.which === 'in' ? clamp(t - c.start, 0, Math.max(0, c.duration - c.fadeOut)) : clamp(clipEnd(c) - t, 0, Math.max(0, c.duration - c.fadeIn));
        const r = Math.round(v * 100) / 100;
        if (r === (d.which === 'in' ? c.fadeIn : c.fadeOut)) return;
        liveDirty.current = true;
        dispatch({ type: 'UPDATE_CLIPS', ids: [c.id], patch: d.which === 'in' ? { fadeIn: r } : { fadeOut: r }, key: d.which === 'in' ? 'fadeIn' : 'fadeOut' });
        return;
      }
      case 'transition': {
        if (!d.edge) return;
        const c = byId(st.seq, d.id);
        if (!c?.transitionIn) return;
        const dur = Math.round(clamp(p.x / st.pps - c.start, 0.1, Math.max(0.1, c.duration * 0.9)) * 100) / 100;
        if (Math.abs(dur - c.transitionIn.duration) <= 1e-3) return;
        liveDirty.current = true;
        dispatch({ type: 'SET_TRANSITION', id: c.id, transition: { ...c.transitionIn, duration: dur } });
        return;
      }
      case 'marker': {
        const m = st.seq.markers.find((x) => x.id === d.id);
        if (!m) return;
        let t = Math.max(0, d.t0 + (p.x - d.x0) / st.pps);
        let snapT: number | null = null;
        if (st.snap) {
          const others = { ...st, seq: { ...st.seq, markers: st.seq.markers.filter((x) => x.id !== m.id) } };
          const sn = snapNear(t, snapPoints(others, new Set()), st.pps);
          if (sn != null) {
            t = sn;
            snapT = sn;
          }
        }
        const tf = frameSnap(t, st.seq.fps || 30);
        setOverlay({ snapT });
        if (Math.abs(tf - m.t) <= 1e-6) return;
        liveDirty.current = true;
        dispatch({ type: 'UPDATE_MARKER', id: m.id, patch: { t: tf } });
        return;
      }
      case 'marquee': {
        const x = Math.min(d.x0, p.x);
        const y = Math.min(d.y0, p.y);
        const w = Math.abs(p.x - d.x0);
        const h = Math.abs(p.y - d.y0);
        const hits: string[] = [];
        for (const row of layout.rows) {
          if (row.top + row.h - 3 < y || row.top + 3 > y + h) continue;
          for (const c of trackClips(st.seq, row.track.id)) if (c.start * st.pps < x + w && clipEnd(c) * st.pps > x) hits.push(c.id);
        }
        const ids = [...new Set([...d.base, ...hits])];
        const key = ids.join(',');
        if (key !== d.lastKey) {
          d.lastKey = key;
          dispatch({ type: 'SELECT', ids });
        }
        setOverlay({ marquee: { x, y, w, h } });
        return;
      }
    }
  };

  const finishDrag = (cx: number, cy: number, alt: boolean) => {
    const d = dragRef.current;
    if (!d) return;
    const st = stateRef.current;
    const p = local(cx, cy);
    if (d.kind === 'move') {
      if (!d.started) {
        if (d.collapseTo) dispatch({ type: 'SELECT', ids: [d.collapseTo] });
      } else {
        const res = computeMove(d, cx, cy) ?? d.last;
        if (res) commitMove(d, res, alt);
      }
    } else if (d.kind === 'trim' && d.pending) {
      d.waitSeq = null;
      runTrim(d, d.pending.x, d.pending.shift);
    } else if (d.kind === 'marquee' && !d.started) {
      if (!d.additive) dispatch({ type: 'SELECT', ids: [] });
      dispatch({ type: 'SEEK', t: Math.max(0, p.x / st.pps) });
    } else if (d.kind === 'marker' && !d.started) {
      const m = st.seq.markers.find((x) => x.id === d.id);
      if (m) dispatch({ type: 'SEEK', t: m.t });
    } else if (d.kind === 'transition' && !d.started) {
      dispatch({ type: 'SELECT', ids: [d.id] });
    }
    stopDrag();
  };

  const handleMoveRef = useRef(handleMove);
  handleMoveRef.current = handleMove;
  const autoScrollRef = useRef(autoScroll);
  autoScrollRef.current = autoScroll;

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    window.removeEventListener('keydown', escHandler, true);
  }, [escHandler]);

  // ── pointer entry point ──
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = e.target as HTMLElement;
    if (el.closest('[data-header]') || el.closest('input,button,textarea,select')) return;
    if (menu) setMenu(null);
    const ae = document.activeElement as HTMLElement | null;
    if (ae && ae !== document.body && rootRef.current?.contains(ae)) ae.blur();
    const st = stateRef.current;
    const s = st.seq;
    const hitEl = el.closest<HTMLElement>('[data-hit]');
    const hit = hitEl?.dataset.hit;
    const id = hitEl?.dataset.id;
    const p = local(e.clientX, e.clientY);
    const base = { pid: e.pointerId, x0: p.x, y0: p.y, started: false };
    e.preventDefault();

    if (hit === 'ruler' || hit === 'playhead') {
      dispatch({ type: 'SEEK', t: Math.max(0, p.x / st.pps) });
      beginDrag({ kind: 'scrub', ...base, started: true }, e);
      return;
    }
    if (hit === 'marker' && id) {
      if (e.altKey) {
        dispatch({ type: 'REMOVE_MARKER', id });
        return;
      }
      beginDrag({ kind: 'marker', ...base, id, t0: s.markers.find((m) => m.id === id)?.t ?? p.x / st.pps }, e);
      return;
    }

    const clip = byId(s, id);
    const locked = clip ? !!s.tracks.find((t) => t.id === clip.trackId)?.locked : false;

    if (clip && st.tool === 'blade') {
      if (locked) return;
      const t = blade?.t ?? p.x / st.pps;
      if (t > clip.start && t < clipEnd(clip)) dispatch({ type: 'SPLIT', t, ids: [clip.id] });
      return;
    }

    if (clip && (hit === 'trim-start' || hit === 'trim-end') && !locked) {
      if (!selSet.has(clip.id)) dispatch({ type: 'SELECT', ids: [clip.id] });
      const edge = hit === 'trim-start' ? 'start' : 'end';
      beginDrag({ kind: 'trim', ...base, id: clip.id, edge, origDur: clip.duration, origEdge: edge === 'start' ? clip.start : clipEnd(clip), lastT: null, lastRipple: false, waitSeq: null, waitAt: 0, pending: null }, e);
      return;
    }
    if (clip && (hit === 'fade-in' || hit === 'fade-out') && !locked) {
      if (!selSet.has(clip.id)) dispatch({ type: 'SELECT', ids: [clip.id] });
      beginDrag({ kind: 'fade', ...base, id: clip.id, which: hit === 'fade-in' ? 'in' : 'out' }, e);
      return;
    }
    if (clip && (hit === 'tr-body' || hit === 'tr-edge')) {
      if (hit === 'tr-edge' && !locked) {
        if (!selSet.has(clip.id)) dispatch({ type: 'SELECT', ids: [clip.id] });
        beginDrag({ kind: 'transition', ...base, id: clip.id, edge: true }, e);
      } else dispatch({ type: 'SELECT', ids: [clip.id] });
      return;
    }

    if (clip) {
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      const sel = st.selection;
      let next: string[];
      if (additive) {
        next = sel.includes(clip.id) ? sel.filter((x) => x !== clip.id) : [...sel, clip.id];
        dispatch({ type: 'SELECT', ids: [clip.id], additive: true });
        if (!next.includes(clip.id)) return;
      } else {
        next = sel.includes(clip.id) ? sel : [clip.id];
        if (!sel.includes(clip.id)) dispatch({ type: 'SELECT', ids: [clip.id] });
      }
      if (locked) return;
      const moving = withLinked(s, next).filter((x) => {
        const c = byId(s, x);
        return c && !s.tracks.find((t) => t.id === c.trackId)?.locked;
      });
      beginDrag({ kind: 'move', ...base, anchorId: clip.id, ids: next, moving, collapseTo: !additive && sel.includes(clip.id) && sel.length > 1 ? clip.id : null, last: null }, e);
      return;
    }

    // empty lane / zones: marquee (a click without movement clears the selection and seeks)
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    beginDrag({ kind: 'marquee', ...base, additive, base: additive ? st.selection : [], lastKey: '' }, e);
  };

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      ptrRef.current = { x: e.clientX, y: e.clientY, alt: e.altKey, shift: e.shiftKey };
      handleMove(e.clientX, e.clientY, e.altKey, e.shiftKey);
      return;
    }
    if (tool !== 'blade') {
      if (blade) setBlade(null);
      return;
    }
    const p = local(e.clientX, e.clientY);
    const row = p.x >= 0 ? rowAt(p.y) : null;
    if (!row) {
      if (blade) setBlade(null);
      return;
    }
    const st = stateRef.current;
    let t = Math.max(0, p.x / st.pps);
    if (st.snap) t = snapNear(t, snapPoints(st, new Set()), st.pps) ?? t;
    t = frameSnap(t, fps);
    if (!blade || blade.t !== t || blade.top !== row.top) setBlade({ t, top: row.top, h: row.h });
  };

  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (dragRef.current) finishDrag(e.clientX, e.clientY, e.altKey);
  };
  const onPointerCancel = () => {
    if (dragRef.current) stopDrag();
  };

  const onDoubleClick = (e: RMouseEvent<HTMLDivElement>) => {
    const hitEl = (e.target as HTMLElement).closest<HTMLElement>('[data-hit="marker"]');
    if (hitEl?.dataset.id) setEditingMarker(hitEl.dataset.id);
  };

  const onRenameMarker = useCallback(
    (id: string, label: string | null) => {
      setEditingMarker(null);
      const m = stateRef.current.seq.markers.find((x) => x.id === id);
      if (label != null && m && label.trim() && label.trim() !== m.label) dispatch({ type: 'UPDATE_MARKER', id, patch: { label: label.trim() } });
    },
    [dispatch],
  );

  // ── context menu ──
  const closeMenu = useCallback(() => setMenu(null), []);
  const onContextMenu = (e: RMouseEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    if (el.closest('input,textarea')) return;
    e.preventDefault();
    if (dragRef.current) return;
    const st = stateRef.current;
    const s = st.seq;
    const hitEl = el.closest<HTMLElement>('[data-hit]');
    const hit = hitEl?.dataset.hit;
    const id = hitEl?.dataset.id;
    if (el.closest('[data-header]')) return;
    if (hit === 'marker' && id) {
      dispatch({ type: 'REMOVE_MARKER', id });
      return;
    }
    const p = local(e.clientX, e.clientY);
    const t = Math.max(0, p.x / st.pps);
    const clip = byId(s, id);
    let items: MenuItem[];
    if (clip) {
      const ids = st.selection.includes(clip.id) ? st.selection : [clip.id];
      if (!st.selection.includes(clip.id)) dispatch({ type: 'SELECT', ids: [clip.id] });
      const ph = st.playhead;
      const under = ids.filter((x) => {
        const c = byId(s, x);
        return c && ph > c.start + 1e-3 && ph < clipEnd(c) - 1e-3;
      });
      const visual = clip.kind !== 'audio';
      const timed = clip.kind === 'video' || clip.kind === 'audio';
      items = [
        { title: clip.name },
        { label: 'Split at playhead', hint: 'S', icon: <Scissors size={12} />, disabled: !under.length, onSelect: () => dispatch({ type: 'SPLIT', t: ph, ids: under }) },
        { label: 'Delete', hint: '⌫', icon: <Trash2 size={12} />, onSelect: () => dispatch({ type: 'DELETE', ids }), danger: true },
        { label: 'Ripple delete', hint: '⇧⌫', icon: <Delete size={12} />, onSelect: () => dispatch({ type: 'DELETE', ids, ripple: true }), danger: true },
        { sep: true },
        { label: 'Duplicate', hint: '⌘D', icon: <CopyPlus size={12} />, onSelect: () => dispatch({ type: 'DUPLICATE', ids }) },
        { label: 'Copy', hint: '⌘C', icon: <Copy size={12} />, onSelect: () => dispatch({ type: 'COPY', ids }) },
        { label: 'Paste at playhead', hint: '⌘V', icon: <ClipboardPaste size={12} />, disabled: !st.clipboard?.length, onSelect: () => dispatch({ type: 'PASTE', t: ph }) },
      ];
      if ((clip.kind === 'video' && clip.hasAudio && !clip.muted) || clip.linkId) items.push({ sep: true });
      if (clip.kind === 'video' && clip.hasAudio && !clip.muted) items.push({ label: 'Detach audio', icon: <AudioLines size={12} />, onSelect: () => dispatch({ type: 'DETACH_AUDIO', id: clip.id }) });
      if (clip.linkId) items.push({ label: 'Unlink', icon: <Unlink size={12} />, onSelect: () => dispatch({ type: 'UNLINK', id: clip.id }) });
      if (timed) {
        items.push({ sep: true });
        items.push({ label: 'Speed', chips: [0.5, 1, 2].map((r) => ({ label: `${r}×`, active: Math.abs(clip.rate - r) < 1e-6, onSelect: () => dispatch({ type: 'UPDATE_CLIPS', ids: ids.filter((x) => byId(s, x)?.kind === 'video' || byId(s, x)?.kind === 'audio'), patch: { rate: r } }) })) });
      }
      if (visual) {
        items.push({ sep: true }, { title: 'Transition in' });
        for (const type of ['dissolve', 'dip-black', 'slide-left'] as const) items.push({ label: trName[type], icon: type === 'dissolve' ? <Sparkles size={12} /> : <Gauge size={12} />, onSelect: () => dispatch({ type: 'SET_TRANSITION', id: clip.id, transition: { type, duration: 0.5 } }) });
        if (clip.transitionIn) items.push({ label: 'Remove transition', icon: <X size={12} />, onSelect: () => dispatch({ type: 'SET_TRANSITION', id: clip.id, transition: null }) });
      }
    } else {
      items = [
        { title: fmtTC(t, fps) },
        { label: 'Paste here', hint: '⌘V', icon: <ClipboardPaste size={12} />, disabled: !st.clipboard?.length, onSelect: () => dispatch({ type: 'PASTE', t }) },
        { label: 'Add marker here', hint: 'M', icon: <Flag size={12} />, onSelect: () => dispatch({ type: 'ADD_MARKER', t }) },
        { label: 'Move playhead here', icon: <ArrowLeftToLine size={12} />, onSelect: () => dispatch({ type: 'SEEK', t }) },
      ];
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  // ── HTML5 drops (asset panel, presets, Finder files) ──
  type Payload = { asset: DndAsset } | { preset: DndPreset } | { files: File[] } | { unknownFiles: true } | null;
  const payloadFromDrag = (e: RDragEvent): Payload => {
    const types = Array.from(e.dataTransfer.types);
    const cd = currentDrag;
    if (cd?.mime === DND_ASSET && types.includes(DND_ASSET)) return { asset: cd.payload as DndAsset };
    if (cd?.mime === DND_PRESET && types.includes(DND_PRESET)) return { preset: cd.payload as DndPreset };
    if (types.includes('Files')) return { unknownFiles: true };
    return null;
  };

  const computeDrop = (cx: number, cy: number, payload: Payload): DropHint | null => {
    if (!payload) return null;
    const st = stateRef.current;
    const s = st.seq;
    const p = local(cx, cy);
    let t = Math.max(0, p.x / st.pps);
    const row = rowAt(p.y);

    // transitions land on the cut nearest the pointer on a video track
    if ('preset' in payload && payload.preset.kind === 'transition') {
      const pr = payload.preset;
      if (!row || row.track.kind !== 'video' || row.track.locked) return { t, len: 0, label: pr.label, clipKind: null, rowId: row?.track.id ?? null, zone: null, target: null, snapT: null, insertX: null, invalid: true };
      const cands = trackClips(s, row.track.id).filter((c) => c.kind !== 'audio');
      let best: NleClip | null = null;
      for (const c of cands) if (!best || Math.abs(c.start - t) < Math.abs(best.start - t)) best = c;
      if (!best) return { t, len: 0, label: pr.label, clipKind: null, rowId: row.track.id, zone: null, target: null, snapT: null, insertX: null, invalid: true };
      return { t: best.start, len: 0, label: pr.label, clipKind: null, rowId: row.track.id, zone: null, target: row.track.id, snapT: null, insertX: null, transitionClipId: best.id, trDur: Math.min(pr.duration, best.duration * 0.9) };
    }

    if ('files' in payload || 'unknownFiles' in payload) {
      let target: Target = row ? row.track.id : null;
      let zone: Zone | null = null;
      if (p.y < TOP_ZONE) {
        target = { newTrack: 'video', position: 'top' };
        zone = 'top';
      } else if (p.y >= layout.total) {
        target = { newTrack: 'audio', position: 'bottom' };
        zone = 'bottom';
      }
      if (st.snap) t = snapNear(t, snapPoints(st, new Set()), st.pps) ?? t;
      return { t, len: 0, label: 'Drop to import', clipKind: null, rowId: row?.track.id ?? null, zone, target, snapT: null, insertX: null };
    }

    let kind: NleClipKind;
    let len: number;
    let label: string;
    if ('asset' in payload) {
      const a = payload.asset;
      kind = a.media;
      len = a.media === 'image' ? 5 : Math.max(0.05, a.durationSec ?? 5);
      label = a.name;
    } else {
      const pr = payload.preset as Exclude<DndPreset, { kind: 'transition' }>;
      kind = pr.kind;
      len = pr.duration;
      label = pr.label;
    }
    const tk = trackKindFor({ kind });
    const freeOver = (trackId: string, a: number, b: number) => !s.clips.some((c) => c.trackId === trackId && c.start < b - 1e-4 && clipEnd(c) > a + 1e-4);

    let rowId: string | null = null;
    let zone: Zone | null = null;
    let target: Target = null;
    if (p.y < TOP_ZONE && tk === 'video') zone = 'top';
    else if (p.y >= layout.total && tk === 'audio') zone = 'bottom';
    else if (row && row.track.kind === tk && !row.track.locked) rowId = row.track.id;

    if (!zone && !rowId) {
      if (tk === 'audio') {
        rowId = s.tracks.find((tr) => tr.kind === 'audio' && !tr.locked && freeOver(tr.id, t, t + len))?.id ?? null;
        if (!rowId) zone = 'bottom';
      } else if (kind === 'text' || kind === 'color') {
        // overlays never auto-land on the main track
        rowId = s.tracks.find((tr) => tr.kind === 'video' && tr.id !== mainTrackId(s) && !tr.locked && freeOver(tr.id, t, t + len))?.id ?? null;
        if (!rowId) zone = 'top';
      } else {
        rowId = unlockedMain();
        if (!rowId) zone = 'top';
      }
    }
    target = zone ? { newTrack: tk, position: zone } : rowId;

    let snapT: number | null = null;
    let insertX: number | null = null;
    const main = mainTrackId(s);
    if (st.magnetic && rowId && rowId === main) {
      t = mainInsertion(s, t, new Set());
      insertX = t * st.pps;
    } else if (st.snap) {
      const pts = snapPoints(st, new Set());
      const sa = snapNear(t, pts, st.pps);
      const sb = snapNear(t + len, pts, st.pps);
      if (sa != null && (sb == null || Math.abs(sa - t) <= Math.abs(sb - (t + len)))) {
        t = sa;
        snapT = sa;
      } else if (sb != null && sb - len >= 0) {
        t = sb - len;
        snapT = sb;
      }
    }
    return { t, len, label, clipKind: kind, rowId, zone, target, snapT, insertX };
  };

  const sameHint = (a: DropHint | null, b: DropHint | null) =>
    a === b || (!!a && !!b && a.t === b.t && a.rowId === b.rowId && a.zone === b.zone && a.transitionClipId === b.transitionClipId && a.invalid === b.invalid && a.len === b.len);

  const onDragOver = (e: RDragEvent<HTMLDivElement>) => {
    if (!isOurDrag(e)) return;
    e.preventDefault();
    const h = computeDrop(e.clientX, e.clientY, payloadFromDrag(e));
    e.dataTransfer.dropEffect = h?.invalid ? 'none' : 'copy';
    setDropHint((prev) => (sameHint(prev, h) ? prev : h));
  };
  const onDragLeave = (e: RDragEvent<HTMLDivElement>) => {
    const rel = e.relatedTarget as Node | null;
    if (!rel || !rootRef.current?.contains(rel)) setDropHint(null);
  };
  const onDrop = (e: RDragEvent<HTMLDivElement>) => {
    if (!isOurDrag(e)) return;
    e.preventDefault();
    const data = readDrop(e);
    setDropHint(null);
    clearDrag();
    if (!data) return;
    const h = computeDrop(e.clientX, e.clientY, data);
    if (!h || h.invalid) return;
    if ('files' in data) {
      onDropFiles(data.files, { t: h.t, trackId: h.target });
      return;
    }
    if ('asset' in data) {
      dispatch({ type: 'ADD_CLIPS', clips: [clipFromAsset(data.asset)], trackId: h.target, start: h.t });
      return;
    }
    const pr = data.preset;
    if (pr.kind === 'transition') {
      if (h.transitionClipId) dispatch({ type: 'SET_TRANSITION', id: h.transitionClipId, transition: { type: pr.type as NleTransitionType, duration: pr.duration } });
      return;
    }
    const clip =
      pr.kind === 'text'
        ? baseClip('text', { name: pr.label, duration: pr.duration, text: { ...DEFAULT_TEXT, ...pr.style }, transform: { ...IDENTITY, ...(pr.transform ?? {}) } })
        : baseClip('color', { name: pr.label, duration: pr.duration, color: pr.color });
    dispatch({ type: 'ADD_CLIPS', clips: [clip], trackId: h.target, start: h.t });
  };

  // drag left the window / ended elsewhere
  useEffect(() => {
    const leave = (e: DragEvent) => {
      if (e.relatedTarget == null && (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight)) {
        setDropHint(null);
        clearDrag();
      }
    };
    const end = () => setDropHint(null);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragend', end);
    window.addEventListener('drop', end);
    return () => {
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragend', end);
      window.removeEventListener('drop', end);
    };
  }, []);

  // blade hover only makes sense with the blade tool
  useEffect(() => {
    if (tool !== 'blade') setBlade(null);
  }, [tool]);

  // ── toolbar ──
  const onCmd = useCallback(
    (c: ToolbarCmd) => {
      const st = stateRef.current;
      const sel = st.selection;
      switch (c) {
        case 'undo':
          return dispatch({ type: 'UNDO' });
        case 'redo':
          return dispatch({ type: 'REDO' });
        case 'select':
          return dispatch({ type: 'SET_TOOL', tool: 'select' });
        case 'blade':
          return dispatch({ type: 'SET_TOOL', tool: 'blade' });
        case 'split':
          return dispatch({ type: 'SPLIT', t: st.playhead });
        case 'delete':
          return sel.length ? dispatch({ type: 'DELETE', ids: sel }) : undefined;
        case 'ripple':
          return sel.length ? dispatch({ type: 'DELETE', ids: sel, ripple: true }) : undefined;
        case 'duplicate':
          return sel.length ? dispatch({ type: 'DUPLICATE', ids: sel }) : undefined;
        case 'detach': {
          const v = sel.map((id) => byId(st.seq, id)).find((x) => x && x.kind === 'video' && x.hasAudio && !x.muted);
          return v ? dispatch({ type: 'DETACH_AUDIO', id: v.id }) : undefined;
        }
        case 'marker':
          return dispatch({ type: 'ADD_MARKER', t: st.playhead });
        case 'snap':
          return dispatch({ type: 'TOGGLE_SNAP' });
        case 'magnetic':
          return dispatch({ type: 'TOGGLE_MAGNETIC' });
        case 'addVideo':
          return dispatch({ type: 'ADD_TRACK', kind: 'video' });
        case 'addAudio':
          return dispatch({ type: 'ADD_TRACK', kind: 'audio' });
        case 'zoomIn':
          return zoomTo(st.pps * 1.5);
        case 'zoomOut':
          return zoomTo(st.pps / 1.5);
        case 'fit':
          return fit();
      }
    },
    [dispatch, zoomTo, fit],
  );
  const onZoom = useCallback((p: number) => zoomTo(p), [zoomTo]);
  const canDetach = useMemo(() => selection.some((id) => {
    const c = seq.clips.find((x) => x.id === id);
    return !!c && c.kind === 'video' && c.hasAudio && !c.muted;
  }), [selection, seq.clips]);

  // ── render ──
  const moving = overlay?.moving && !overlay.alt ? overlay.moving : null;
  const trimClip = overlay?.trimId ? byId(seq, overlay.trimId) : undefined;
  const trimRow = trimClip ? layout.byId.get(trimClip.trackId) : undefined;
  const dropRow = dropHint?.rowId ? layout.byId.get(dropHint.rowId) : undefined;
  const dropRect = dropHint ? (dropHint.zone ? zoneRect(dropHint.zone) : dropRow ? { y: dropRow.top + 3, h: dropRow.h - 6 } : null) : null;
  const trClip = dropHint?.transitionClipId ? byId(seq, dropHint.transitionClipId) : undefined;
  const empty = seq.clips.length === 0;
  const dragging = !!overlay;

  return (
    <section className={cn('hud-card flex h-full min-h-0 flex-col overflow-hidden', className)}>
      <Toolbar
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        tool={tool}
        snap={state.snap}
        magnetic={state.magnetic}
        hasSelection={selection.length > 0}
        canDetach={canDetach}
        pps={pps}
        onCmd={onCmd}
        onZoom={onZoom}
      />
      <div ref={scrollRef} className="hud-scroll relative min-h-0 flex-1 overflow-auto overscroll-contain">
        <div
          ref={rootRef}
          className={cn('relative flex flex-col', tool === 'blade' && 'cursor-crosshair', overlay?.ghosts && 'cursor-grabbing')}
          style={{ width: HEADER_W + contentW, minHeight: view.h }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={() => blade && setBlade(null)}
          onContextMenu={onContextMenu}
          onDoubleClick={onDoubleClick}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {/* ruler row */}
          <div className="sticky top-0 z-30 flex shrink-0" style={{ height: RULER_H }}>
            <div data-header className="sticky left-0 z-10 shrink-0 border-b border-r border-subtle bg-panel" style={{ width: HEADER_W }}>
              <PlayheadTC t={playhead} fps={fps} total={duration} />
            </div>
            <div data-hit="ruler" className="relative shrink-0 cursor-col-resize overflow-hidden border-b border-subtle bg-panel-elevated" style={{ width: contentW }}>
              <Ruler pps={pps} fps={fps} markers={seq.markers} scrollEl={scrollRef} editingMarker={editingMarker} onRenameMarker={onRenameMarker} />
              {overlay?.snapT != null && <div className="pointer-events-none absolute bottom-0 top-0 z-[4] w-px" style={{ left: overlay.snapT * pps, background: SNAP_YELLOW }} />}
              <PlayheadHead t={playhead} pps={pps} />
            </div>
          </div>

          {/* tracks */}
          <div ref={wrapRef} className="relative flex flex-1 flex-col" style={{ minHeight: tracksAreaH }}>
            <div className="flex shrink-0" style={{ height: TOP_ZONE }}>
              <div data-header className="sticky left-0 z-20 shrink-0 border-r border-subtle bg-panel" style={{ width: HEADER_W }} />
              <div data-hit="lane" className="shrink-0 border-b border-subtle/60" style={{ width: contentW }} />
            </div>
            {layout.rows.map((row) => {
              const t = row.track;
              const isMain = t.id === mainId;
              const clips = clipsByTrack.get(t.id);
              return (
                <div key={t.id} className="flex shrink-0" style={{ height: row.h }}>
                  <TrackHeader track={t} height={row.h} isMain={isMain} magnetic={state.magnetic} canDelete={kindCount[t.kind] > 1} dispatch={dispatch} />
                  <div
                    data-hit="lane"
                    data-id={t.id}
                    className={cn('relative shrink-0 border-b border-subtle', isMain ? 'bg-orange/[0.035]' : t.kind === 'audio' ? 'bg-obsidian/40' : '')}
                    style={{ width: contentW, height: row.h }}
                  >
                    {clips?.map((c) => (
                      <ClipView key={c.id} clip={c} pps={pps} laneH={row.h} selected={selSet.has(c.id)} locked={t.locked} dim={t.hidden || (!!moving && moving.has(c.id))} trackMuted={t.muted} blade={tool === 'blade'} />
                    ))}
                    {t.locked && <div className="pointer-events-none absolute inset-0 z-[6] bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.05)_0_6px,transparent_6px_12px)]" />}
                    {isMain && empty && (
                      <div className="pointer-events-none absolute inset-y-[5px] left-2 flex items-center gap-2 rounded-[6px] border-2 border-dashed border-highlight px-4 font-mono text-[11px] text-secondary" style={{ width: Math.min(lanesW - 24, 560) }}>
                        <Upload size={14} className="text-orange" />
                        Drag media here — or click + on any file
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="flex flex-1" style={{ minHeight: BOTTOM_ZONE }}>
              <div data-header className="sticky left-0 z-20 shrink-0 border-r border-subtle bg-panel" style={{ width: HEADER_W }} />
              <div data-hit="lane" className="shrink-0" style={{ width: contentW }} />
            </div>

            {/* overlay: markers, ghosts, guides, playhead */}
            <div className="pointer-events-none absolute bottom-0 top-0 z-10" style={{ left: HEADER_W, width: contentW }}>
              {seq.markers.map((m) => (
                <div key={m.id} className="absolute bottom-0 top-0 w-px opacity-30" style={{ left: m.t * pps, background: m.color }} />
              ))}

              {(overlay?.zone || dropHint?.zone) && (
                <div
                  className="absolute left-0 right-0 flex items-center rounded-[4px] border border-dashed border-orange/80 bg-orange/10 pl-2 font-mono text-[9.5px] font-semibold text-orange"
                  style={(() => {
                    const r = zoneRect((overlay?.zone ?? dropHint?.zone) as Zone);
                    return { top: r.y, height: r.h };
                  })()}
                >
                  + New {(overlay?.zone ?? dropHint?.zone) === 'top' ? 'video' : 'audio'} track
                </div>
              )}

              {overlay?.ghosts?.map((g) => (
                <div
                  key={g.key}
                  className="absolute overflow-hidden rounded-[4px] border-2 px-1.5 font-mono text-[9.5px] font-semibold leading-[15px] text-paper shadow-[0_6px_18px_rgba(0,0,0,0.5)]"
                  style={{ left: g.x, top: g.y, width: g.w, height: g.h, background: KIND_STYLE[g.kind].bg, borderColor: overlay.alt ? '#22C55E' : '#FF5500', opacity: 0.92 }}
                >
                  <span className="block truncate">{overlay.alt ? `+ ${g.name}` : g.name}</span>
                </div>
              ))}

              {overlay?.insert && (
                <div className="absolute w-[3px] -translate-x-1/2 rounded-full bg-orange shadow-[0_0_8px_#FF5500]" style={{ left: overlay.insert.x, top: overlay.insert.y + 1, height: overlay.insert.h - 2 }}>
                  <span className="absolute -left-[3px] -top-[3px] h-[9px] w-[9px] rotate-45 bg-orange" />
                </div>
              )}

              {overlay?.marquee && <div className="absolute rounded-[2px] border border-orange/80 bg-orange/10" style={{ left: overlay.marquee.x, top: overlay.marquee.y, width: overlay.marquee.w, height: overlay.marquee.h }} />}

              {trimClip && trimRow && (
                <div className="absolute z-[2] -translate-y-full whitespace-nowrap rounded-[4px] border border-highlight bg-obsidian/95 px-1.5 py-[3px] font-mono text-[9.5px] leading-none text-paper shadow" style={{ left: Math.max(0, trimClip.start * pps), top: trimRow.top - 2 }}>
                  <span className="text-orange">{fmtShort(trimClip.duration)}</span>
                  {trimClip.sourceDuration != null && (
                    <span className="text-secondary">
                      {' '}
                      · in {fmtTC(trimClip.mediaStart, fps)} → out {fmtTC(trimClip.mediaStart + trimClip.duration * trimClip.rate, fps)}
                    </span>
                  )}
                  {overlay?.trimRipple && <span className="text-amber"> · ripple</span>}
                </div>
              )}

              {blade && tool === 'blade' && !dragging && (
                <div className="absolute w-px" style={{ left: blade.t * pps, top: blade.top, height: blade.h, background: '#F87171', boxShadow: '0 0 6px rgba(248,113,113,0.8)' }}>
                  <span className="absolute -top-[14px] left-1 whitespace-nowrap rounded-[3px] bg-obsidian/90 px-1 font-mono text-[9px] text-[#F87171]">{fmtTC(blade.t, fps)}</span>
                </div>
              )}

              {dropHint && !dropHint.invalid && !dropHint.transitionClipId && dropRect && (
                <div
                  className="absolute flex items-center overflow-hidden rounded-[4px] border-2 border-dashed px-1.5 font-mono text-[9.5px] font-semibold text-paper"
                  style={{ left: dropHint.t * pps, top: dropRect.y, width: Math.max(dropHint.len * pps, 6), height: dropRect.h, background: dropHint.clipKind ? KIND_STYLE[dropHint.clipKind].bg : 'rgba(255,85,0,0.12)', borderColor: '#FF5500' }}
                >
                  <span className="truncate">{dropHint.label}</span>
                </div>
              )}
              {dropHint && !dropHint.invalid && !dropHint.transitionClipId && !dropHint.len && dropRect && (
                <span className="absolute whitespace-nowrap rounded-[3px] bg-orange px-1 font-mono text-[9px] font-bold text-obsidian" style={{ left: dropHint.t * pps + 4, top: dropRect.y + 2 }}>
                  {dropHint.label}
                </span>
              )}
              {dropHint?.insertX != null && dropRow && (
                <div className="absolute w-[3px] -translate-x-1/2 rounded-full bg-orange shadow-[0_0_8px_#FF5500]" style={{ left: dropHint.insertX, top: dropRow.top + 1, height: dropRow.h - 2 }} />
              )}
              {trClip && dropRow && (
                <div className="absolute" style={{ left: trClip.start * pps - 2, top: dropRow.top + 2, height: dropRow.h - 4 }}>
                  <div className="absolute bottom-0 top-0 w-[3px] rounded-full bg-orange shadow-[0_0_10px_#FF5500]" />
                  <div className="absolute top-1/2 -translate-y-1/2 rounded-[3px] border border-orange bg-obsidian/90 px-1 font-mono text-[9px] text-orange" style={{ left: 6, minWidth: Math.max(14, (dropHint?.trDur ?? 0) * pps) }}>
                    ⧓ {dropHint?.label}
                  </div>
                </div>
              )}

              {overlay?.snapT != null && <div className="absolute bottom-0 top-0 w-px" style={{ left: overlay.snapT * pps, background: SNAP_YELLOW, boxShadow: `0 0 6px ${SNAP_YELLOW}` }} />}

              <PlayheadLine t={playhead} pps={pps} playing={state.playing} scrollEl={scrollRef} suspendFollow={dragging} />
            </div>
          </div>
        </div>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} scrollEl={scrollRef} />}
    </section>
  );
}
