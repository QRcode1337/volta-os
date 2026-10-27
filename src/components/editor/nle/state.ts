// VOLTA Editor — Edit mode store: one reducer for the sequence (undoable) and the UI state around it (not undoable).
// Every sequence mutation goes through `commit()`, which records history, enforces the magnetic main track and
// stamps updatedAt. Components never mutate the sequence themselves; they dispatch these actions.
import type { NleClip, NleMarker, NleSequence, NleTrack, NleTrackKind, NleTransform, NleTransition } from '@/types/nle';
import { EPS, MIN_CLIP, clamp, clipEnd, frameSnap, mainTrackId, maxDuration, newSequence, sequenceDuration, trackClips, uid } from '@/lib/nle/model';

export type NleTool = 'select' | 'blade';
export type NleLeftTab = 'media' | 'text' | 'transitions' | 'elements';

export interface NleState {
  seq: NleSequence;
  past: NleSequence[];
  future: NleSequence[];
  /** History coalescing: consecutive commits with the same key within COALESCE_MS make one undo step (slider drags). */
  lastKey: string | null;
  lastAt: number;
  selection: string[];
  playhead: number;
  playing: boolean;
  /** Snap to clip edges, playhead and markers while dragging. */
  snap: boolean;
  /** Main track stays gap-free (CapCut "main track magnet"): moves reorder, deletes ripple. */
  magnetic: boolean;
  tool: NleTool;
  clipboard: NleClip[] | null;
  /** Timeline zoom, pixels per second. */
  pps: number;
  leftTab: NleLeftTab;
  /** Save state of the current project on the server. */
  saved: 'saved' | 'dirty' | 'saving' | 'error';
}

const HISTORY = 100;
/** Same-key commits closer than this merge into one undo step (a drag that pauses briefly stays one step). */
const COALESCE_MS = 4000;

export function initialNleState(seq: NleSequence = newSequence()): NleState {
  return { seq, past: [], future: [], lastKey: null, lastAt: 0, selection: [], playhead: 0, playing: false, snap: true, magnetic: true, tool: 'select', clipboard: null, pps: 60, leftTab: 'media', saved: 'saved' };
}

// ───────────────────────── actions ─────────────────────────

/** A new track target for drops / moves outside existing tracks. */
export type NewTrackTarget = { newTrack: NleTrackKind; position: 'top' | 'bottom' };

export type NleAction =
  // project
  | { type: 'LOAD'; seq: NleSequence }
  | { type: 'SET_SEQ_PROPS'; patch: Partial<Pick<NleSequence, 'name' | 'width' | 'height' | 'fps' | 'background'>> }
  | { type: 'SET_SAVED'; saved: NleState['saved'] }
  // clips
  /** Add clips (from the bin, a text / transition preset, an upload). `trackId` null = first free compatible track, or a new one. On the magnetic main track the clip is ripple-inserted at `start`. */
  | { type: 'ADD_CLIPS'; clips: NleClip[]; trackId: string | NewTrackTarget | null; start: number; select?: boolean }
  /** Move clips by dt; the anchor clip lands on `toTrack` and the others keep their track offset (within the same kind). Linked partners follow. */
  | { type: 'MOVE_CLIPS'; ids: string[]; anchorId: string; dt: number; toTrack: string | NewTrackTarget | null; key?: string }
  /** Trim one edge to sequence time `t`. Start trims move mediaStart; both clamp to the source and to neighbours. Linked partners follow. */
  | { type: 'TRIM'; id: string; edge: 'start' | 'end'; t: number; ripple?: boolean }
  /** Blade at t: the given clips, or (ids omitted) the selected clips under t, or every unlocked clip under t. */
  | { type: 'SPLIT'; t: number; ids?: string[] }
  | { type: 'DELETE'; ids: string[]; ripple?: boolean }
  /** Without dt: copies go right after the group (another free track when that spot is taken). With dt (⌥-drag): copies land at start + dt, the anchor's copy on `toTrack`, as one undo step. */
  | { type: 'DUPLICATE'; ids: string[]; dt?: number; anchorId?: string; toTrack?: string | NewTrackTarget | null }
  | { type: 'COPY'; ids: string[] }
  | { type: 'PASTE'; t: number }
  /**
   * Inspector edits. `key` coalesces a slider drag into one undo step. `patch` applies to every id; `patches` adds a
   * per-id patch; `transformPatch` merges into each clip's own transform (multi-clip opacity etc.).
   */
  | { type: 'UPDATE_CLIPS'; ids: string[]; patch?: Partial<NleClip>; patches?: Record<string, Partial<NleClip>>; transformPatch?: Partial<NleTransform>; key?: string }
  | { type: 'SET_TRANSITION'; id: string; transition: NleTransition | null }
  /** Video with sound → muted video + linked audio clip on an audio track. */
  | { type: 'DETACH_AUDIO'; id: string }
  | { type: 'UNLINK'; id: string }
  | { type: 'NUDGE'; ids: string[]; frames: number }
  // tracks
  | { type: 'ADD_TRACK'; kind: NleTrackKind }
  | { type: 'REMOVE_TRACK'; id: string }
  | { type: 'UPDATE_TRACK'; id: string; patch: Partial<Pick<NleTrack, 'name' | 'muted' | 'hidden' | 'locked'>> }
  // markers
  | { type: 'ADD_MARKER'; t: number; label?: string }
  | { type: 'UPDATE_MARKER'; id: string; patch: Partial<Omit<NleMarker, 'id'>> }
  | { type: 'REMOVE_MARKER'; id: string }
  // selection / transport / view
  | { type: 'SELECT'; ids: string[]; additive?: boolean }
  | { type: 'SELECT_ALL' }
  | { type: 'SEEK'; t: number }
  | { type: 'TICK'; dt: number }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'STEP'; frames: number }
  | { type: 'SET_ZOOM'; pps: number }
  | { type: 'TOGGLE_SNAP' }
  | { type: 'TOGGLE_MAGNETIC' }
  | { type: 'SET_TOOL'; tool: NleTool }
  | { type: 'SET_LEFT_TAB'; tab: NleLeftTab }
  | { type: 'UNDO' }
  | { type: 'REDO' };

// ───────────────────────── sequence helpers (pure) ─────────────────────────

const byId = (s: NleSequence, id: string) => s.clips.find((c) => c.id === id);

/** ids plus every clip linked to any of them. */
export function withLinked(s: NleSequence, ids: string[]): string[] {
  const set = new Set(ids);
  const links = new Set(s.clips.filter((c) => set.has(c.id) && c.linkId).map((c) => c.linkId));
  for (const c of s.clips) if (c.linkId && links.has(c.linkId)) set.add(c.id);
  return [...set];
}

function isLocked(s: NleSequence, c: NleClip): boolean {
  return !!s.tracks.find((t) => t.id === c.trackId)?.locked;
}

function trackKindFor(c: NleClip): NleTrackKind {
  return c.kind === 'audio' ? 'audio' : 'video';
}

function nextTrackName(s: NleSequence, kind: NleTrackKind): string {
  const p = kind === 'video' ? 'V' : 'A';
  const n = s.tracks.filter((t) => t.kind === kind).length + 1;
  return `${p}${n}`;
}

/** Insert a new track: video tracks go above the existing video tracks (top) or just above V1 (bottom); audio tracks below. */
function addTrack(s: NleSequence, kind: NleTrackKind, position: 'top' | 'bottom' = kind === 'video' ? 'top' : 'bottom'): { seq: NleSequence; id: string } {
  const track: NleTrack = { id: uid('t'), kind, name: nextTrackName(s, kind), muted: false, hidden: false, locked: false };
  const tracks = [...s.tracks];
  const firstAudio = tracks.findIndex((t) => t.kind === 'audio');
  const lastVideo = firstAudio === -1 ? tracks.length - 1 : firstAudio - 1;
  let at: number;
  if (kind === 'video') at = position === 'top' ? 0 : Math.max(0, lastVideo); // bottom = directly above the main track
  else at = position === 'top' ? (firstAudio === -1 ? tracks.length : firstAudio) : tracks.length;
  tracks.splice(at, 0, track);
  return { seq: { ...s, tracks }, id: track.id };
}

function resolveTrack(s: NleSequence, target: string | NewTrackTarget | null, kind: NleTrackKind, span: [number, number], exclude?: string | null): { seq: NleSequence; id: string } {
  if (typeof target === 'string') {
    const t = s.tracks.find((x) => x.id === target);
    if (t && t.kind === kind && !t.locked) return { seq: s, id: t.id };
  } else if (target) {
    return addTrack(s, target.newTrack === kind ? kind : kind, target.position);
  }
  // first compatible unlocked track free over span (main track first for video), else a new one
  const main = mainTrackId(s);
  const candidates = s.tracks.filter((t) => t.kind === kind && !t.locked);
  const ordered = kind === 'video' ? [...candidates].sort((a, b) => (a.id === main ? -1 : b.id === main ? 1 : s.tracks.indexOf(b) - s.tracks.indexOf(a))) : candidates;
  for (const t of ordered) {
    if (t.id === exclude) continue;
    if (t.id === main) return { seq: s, id: t.id }; // main track always accepts (ripple insert)
    const free = !s.clips.some((c) => c.trackId === t.id && c.start < span[1] - EPS && clipEnd(c) > span[0] + EPS);
    if (free) return { seq: s, id: t.id };
  }
  return addTrack(s, kind);
}

/** Overwrite [a,b) on a track: trims, splits or removes the clips there (except `keep`). */
function overwrite(clips: NleClip[], trackId: string, a: number, b: number, keep: Set<string>): NleClip[] {
  const out: NleClip[] = [];
  for (const c of clips) {
    if (c.trackId !== trackId || keep.has(c.id)) {
      out.push(c);
      continue;
    }
    const s0 = c.start;
    const e0 = clipEnd(c);
    if (e0 <= a + EPS || s0 >= b - EPS) {
      out.push(c);
      continue;
    }
    if (s0 < a - EPS) out.push({ ...c, duration: a - s0 }); // keep the head
    if (e0 > b + EPS) {
      const cut = b - s0;
      out.push({ ...c, id: s0 < a - EPS ? uid('c') : c.id, start: b, duration: e0 - b, mediaStart: c.mediaStart + cut * c.rate, transitionIn: null, linkId: s0 < a - EPS ? null : c.linkId });
    }
  }
  return out;
}

/**
 * Pack the main track gap-free from 0. Sort key: moved clips by their new start, others by their midpoint, so a
 * dropped clip lands before any clip whose middle it was dropped ahead of. Linked partners shift with their clip.
 */
function repackMain(s: NleSequence, moved: Set<string> = new Set()): NleSequence {
  const main = mainTrackId(s);
  if (!main) return s;
  const onMain = s.clips.filter((c) => c.trackId === main);
  if (!onMain.length) return s;
  const key = (c: NleClip) => (moved.has(c.id) ? c.start : c.start + c.duration / 2);
  onMain.sort((a, b) => key(a) - key(b) || a.start - b.start);
  const shift = new Map<string, number>();
  let t = 0;
  for (const c of onMain) {
    shift.set(c.id, t - c.start);
    t += c.duration;
  }
  const linkShift = new Map<string, number>();
  for (const c of onMain) if (c.linkId) linkShift.set(c.linkId, shift.get(c.id) ?? 0);
  return {
    ...s,
    clips: s.clips.map((c) => {
      if (c.trackId === main) {
        const d = shift.get(c.id) ?? 0;
        return Math.abs(d) > EPS ? { ...c, start: c.start + d } : c;
      }
      if (c.linkId && linkShift.has(c.linkId) && !moved.has(c.id)) {
        const d = linkShift.get(c.linkId) ?? 0;
        return Math.abs(d) > EPS ? { ...c, start: Math.max(0, c.start + d) } : c;
      }
      return c;
    }),
  };
}

/** Drop a transitionIn whose clip no longer has room for it. */
function sanitize(s: NleSequence): NleSequence {
  let changed = false;
  const clips = s.clips.map((c) => {
    let n = c;
    if (c.start < 0) n = { ...n, start: 0 };
    if (c.transitionIn && c.transitionIn.duration > c.duration * 0.9) n = { ...n, transitionIn: { ...c.transitionIn, duration: Math.max(0.1, c.duration * 0.9) } };
    if (n !== c) changed = true;
    return n;
  });
  // remove tracks? never automatically. Drop markers past the end? keep.
  return changed ? { ...s, clips } : s;
}

// ───────────────────────── reducer ─────────────────────────

function commit(st: NleState, next: NleSequence, opts: { key?: string; selection?: string[]; moved?: Set<string> } = {}): NleState {
  let seq = st.magnetic ? repackMain(next, opts.moved) : next;
  seq = sanitize(seq);
  seq = { ...seq, updatedAt: new Date().toISOString() };
  const now = Date.now();
  const coalesce = !!opts.key && opts.key === st.lastKey && now - st.lastAt < COALESCE_MS;
  const past = coalesce ? st.past : [...st.past, st.seq].slice(-HISTORY);
  const ids = new Set(seq.clips.map((c) => c.id));
  const selection = (opts.selection ?? st.selection).filter((id) => ids.has(id));
  return { ...st, seq, past, future: [], lastKey: opts.key ?? null, lastAt: now, selection, saved: 'dirty' };
}

function splitClip(c: NleClip, t: number, linkMap: Map<string, string>): [NleClip, NleClip] | null {
  if (t <= c.start + MIN_CLIP || t >= clipEnd(c) - MIN_CLIP) return null;
  const head = t - c.start;
  let rightLink: string | null = null;
  if (c.linkId) {
    if (!linkMap.has(c.linkId)) linkMap.set(c.linkId, uid('l'));
    rightLink = linkMap.get(c.linkId) ?? null;
  }
  const left: NleClip = { ...c, duration: head, fadeOut: 0, transformEnd: null };
  const right: NleClip = { ...c, id: uid('c'), start: t, duration: c.duration - head, mediaStart: c.mediaStart + head * c.rate, transitionIn: null, fadeIn: 0, linkId: rightLink, transformEnd: null };
  if (c.transformEnd) {
    // keep the animation continuous across the cut
    const p = head / c.duration;
    const mid = { x: c.transform.x + (c.transformEnd.x - c.transform.x) * p, y: c.transform.y + (c.transformEnd.y - c.transform.y) * p, scale: c.transform.scale + (c.transformEnd.scale - c.transform.scale) * p, rotation: c.transform.rotation + (c.transformEnd.rotation - c.transform.rotation) * p, opacity: c.transform.opacity + (c.transformEnd.opacity - c.transform.opacity) * p };
    left.transformEnd = mid;
    right.transform = mid;
    right.transformEnd = c.transformEnd;
  }
  return [left, right];
}

export function nleReducer(st: NleState, a: NleAction): NleState {
  const s = st.seq;
  switch (a.type) {
    case 'LOAD':
      return { ...initialNleState(a.seq), snap: st.snap, magnetic: st.magnetic, pps: st.pps, leftTab: st.leftTab };
    case 'SET_SEQ_PROPS':
      return commit(st, { ...s, ...a.patch }, { key: `seq:${Object.keys(a.patch).join(',')}` });
    case 'SET_SAVED':
      return { ...st, saved: a.saved };

    case 'ADD_CLIPS': {
      if (!a.clips.length) return st;
      let seq = s;
      let t = Math.max(0, a.start);
      const added: string[] = [];
      const main = mainTrackId(seq);
      for (const raw of a.clips) {
        const kind = trackKindFor(raw);
        const r = resolveTrack(seq, a.trackId, kind, [t, t + raw.duration]);
        seq = r.seq;
        const clip: NleClip = { ...raw, id: raw.id || uid('c'), trackId: r.id, start: t };
        if (r.id === mainTrackId(seq) && st.magnetic) {
          // ripple insert: split whatever is under t, push everything at/after t right by the clip's length
          const linkMap = new Map<string, string>();
          let clips: NleClip[] = [];
          for (const c of seq.clips) {
            if (c.trackId === r.id && t > c.start + EPS && t < clipEnd(c) - EPS) {
              const parts = splitClip(c, t, linkMap);
              if (parts) clips.push(...parts);
              else clips.push(c);
            } else clips.push(c);
          }
          const pushedLinks = new Set(clips.filter((c) => c.trackId === r.id && c.start >= t - EPS && c.linkId).map((c) => c.linkId));
          // push later main-track clips right, and their linked partners (detached audio) with them
          clips = clips.map((c) => (c.trackId === r.id ? (c.start >= t - EPS ? { ...c, start: c.start + clip.duration } : c) : c.linkId && pushedLinks.has(c.linkId) ? { ...c, start: c.start + clip.duration } : c));
          seq = { ...seq, clips: [...clips, clip] };
        } else {
          seq = { ...seq, clips: [...overwrite(seq.clips, r.id, t, t + clip.duration, new Set()), clip] };
        }
        added.push(clip.id);
        if (a.clips.length > 1) t += clip.duration;
        void main;
      }
      return commit(st, seq, { selection: a.select === false ? st.selection : added, moved: new Set(added) });
    }

    case 'MOVE_CLIPS': {
      const ids = withLinked(s, a.ids).filter((id) => {
        const c = byId(s, id);
        return c && !isLocked(s, c);
      });
      const anchor = byId(s, a.anchorId);
      if (!ids.length || !anchor) return st;
      let seq = s;
      // track offset for the anchor, applied to its non-linked companions of the same kind
      let destId = anchor.trackId;
      if (a.toTrack) {
        const r = resolveTrack(seq, a.toTrack, trackKindFor(anchor), [anchor.start + a.dt, clipEnd(anchor) + a.dt]);
        seq = r.seq;
        destId = r.id;
      }
      const kindTracks = (k: NleTrackKind) => seq.tracks.filter((t) => t.kind === k).map((t) => t.id);
      const anchorKind = trackKindFor(anchor);
      const list = kindTracks(anchorKind);
      const offset = list.indexOf(destId) - list.indexOf(anchor.trackId);
      const anchorLink = anchor.linkId;
      const dt = Math.max(a.dt, -Math.min(...ids.map((id) => byId(s, id)?.start ?? 0)));
      const movedSet = new Set(ids);
      const moved = seq.clips
        .filter((c) => movedSet.has(c.id))
        .map((c) => {
          let trackId = c.trackId;
          const k = trackKindFor(c);
          const isLinkPartner = anchorLink && c.linkId === anchorLink && c.id !== anchor.id;
          if (c.id === anchor.id) trackId = destId;
          else if (!isLinkPartner && k === anchorKind && offset) {
            const l = kindTracks(k);
            trackId = l[clamp(l.indexOf(c.trackId) + offset, 0, l.length - 1)] ?? c.trackId;
          }
          return { ...c, trackId, start: Math.max(0, c.start + dt), transitionIn: c.trackId === trackId ? c.transitionIn : null };
        });
      let rest = seq.clips.filter((c) => !movedSet.has(c.id));
      const main = mainTrackId(seq);
      for (const m of moved) if (!(st.magnetic && m.trackId === main)) rest = overwrite(rest, m.trackId, m.start, clipEnd(m), movedSet);
      return commit(st, { ...seq, clips: [...rest, ...moved] }, { moved: movedSet, key: a.key ? `move:${a.ids.join(',')}:${a.key}` : undefined });
    }

    case 'TRIM': {
      const c = byId(s, a.id);
      if (!c || isLocked(s, c)) return st;
      const fps = s.fps || 30;
      const t = frameSnap(a.t, fps);
      const main = mainTrackId(s);
      const rippleIt = a.ripple || (st.magnetic && c.trackId === main);
      const neighbours = trackClips(s, c.trackId).filter((o) => o.id !== c.id);
      const patch = (x: NleClip): NleClip => {
        if (a.edge === 'start') {
          const prevEnd = rippleIt ? 0 : neighbours.filter((o) => clipEnd(o) <= x.start + EPS).reduce((m, o) => Math.max(m, clipEnd(o)), 0);
          const minStart = Math.max(prevEnd, x.sourceDuration == null ? 0 : x.start - x.mediaStart / x.rate);
          const ns = clamp(t, minStart, clipEnd(x) - MIN_CLIP);
          const d = ns - x.start;
          return { ...x, start: ns, duration: x.duration - d, mediaStart: Math.max(0, x.mediaStart + d * x.rate) };
        }
        const nextStart = rippleIt ? Infinity : neighbours.filter((o) => o.start >= clipEnd(x) - EPS).reduce((m, o) => Math.min(m, o.start), Infinity);
        const ne = clamp(t, x.start + MIN_CLIP, Math.min(nextStart, x.start + maxDuration(x)));
        return { ...x, duration: ne - x.start };
      };
      const next = patch(c);
      const dStart = next.start - c.start;
      const dDur = next.duration - c.duration;
      const linked = new Set(withLinked(s, [c.id]));
      let clips = s.clips.map((x) => {
        if (x.id === c.id) return next;
        if (linked.has(x.id)) {
          const dur = clamp(x.duration + (a.edge === 'start' ? -dStart : dDur), MIN_CLIP, maxDuration({ ...x, mediaStart: a.edge === 'start' ? x.mediaStart + dStart * x.rate : x.mediaStart }));
          return a.edge === 'start' ? { ...x, start: x.start + dStart, duration: dur, mediaStart: Math.max(0, x.mediaStart + dStart * x.rate) } : { ...x, duration: dur };
        }
        return x;
      });
      // explicit ripple on a non-main track: shift later clips on that track by the end change
      if (a.ripple && c.trackId !== main && a.edge === 'end') clips = clips.map((x) => (x.trackId === c.trackId && x.start >= clipEnd(c) - EPS && x.id !== c.id ? { ...x, start: x.start + dDur } : x));
      return commit(st, { ...s, clips }, { key: `trim:${c.id}:${a.edge}` });
    }

    case 'SPLIT': {
      const t = frameSnap(a.t, s.fps || 30);
      const under = (c: NleClip) => t > c.start + EPS && t < clipEnd(c) - EPS && !isLocked(s, c);
      let targets = a.ids ?? st.selection.filter((id) => {
        const c = byId(s, id);
        return c && under(c);
      });
      if (!targets.length) targets = s.clips.filter(under).map((c) => c.id);
      const set = new Set(withLinked(s, targets));
      const linkMap = new Map<string, string>();
      const clips: NleClip[] = [];
      const rights: string[] = [];
      for (const c of s.clips) {
        const parts = set.has(c.id) && under(c) ? splitClip(c, t, linkMap) : null;
        if (parts) {
          clips.push(...parts);
          rights.push(parts[1].id);
        } else clips.push(c);
      }
      if (!rights.length) return st;
      return commit(st, { ...s, clips }, { selection: rights.filter((id) => targets.some((x) => x === id)).length ? rights : st.selection.length ? rights : [] });
    }

    case 'DELETE': {
      const set = new Set(
        withLinked(s, a.ids).filter((id) => {
          const c = byId(s, id);
          return c && !isLocked(s, c);
        }),
      );
      if (!set.size) return st;
      let clips = s.clips.filter((c) => !set.has(c.id));
      if (a.ripple) {
        // close each gap on its own track (the main track is repacked anyway when magnetic)
        for (const gone of s.clips.filter((c) => set.has(c.id))) {
          clips = clips.map((c) => (c.trackId === gone.trackId && c.start >= clipEnd(gone) - EPS ? { ...c, start: Math.max(0, c.start - gone.duration) } : c));
        }
      }
      return commit(st, { ...s, clips }, { selection: [] });
    }

    case 'DUPLICATE': {
      const ids = withLinked(s, a.ids);
      const src = s.clips.filter((c) => ids.includes(c.id));
      if (!src.length) return st;
      const linkMap = new Map<string, string>();
      const copyOf = new Map<string, string>();
      const fresh = (c: NleClip) => {
        if (c.linkId && !linkMap.has(c.linkId)) linkMap.set(c.linkId, uid('l'));
        const id = uid('c');
        copyOf.set(c.id, id);
        return { ...c, id, linkId: c.linkId ? linkMap.get(c.linkId) ?? null : null };
      };
      if (a.dt !== undefined) {
        // ⌥-drag: copies in place, then one MOVE of the copies; history records a single step from the original
        const copies = src.map(fresh);
        const anchor = copyOf.get(a.anchorId ?? src[0].id) ?? copies[0].id;
        const inter: NleState = { ...st, seq: { ...s, clips: [...s.clips, ...copies] } };
        const res = nleReducer(inter, { type: 'MOVE_CLIPS', ids: copies.map((c) => c.id), anchorId: anchor, dt: a.dt, toTrack: a.toTrack ?? null });
        return { ...res, past: [...st.past, s].slice(-HISTORY), selection: copies.map((c) => c.id) };
      }
      const end = Math.max(...src.map(clipEnd));
      const start = Math.min(...src.map((c) => c.start));
      const main = mainTrackId(s);
      let seq = s;
      let clips = [...s.clips];
      const placed: NleClip[] = [];
      for (const c of src) {
        const cp: NleClip = { ...fresh(c), start: c.start - start + end };
        if (st.magnetic && cp.trackId === main) {
          clips = clips.map((x) => (x.trackId === main && x.start >= end - EPS ? { ...x, start: x.start + cp.duration } : x));
        } else if (clips.some((x) => x.trackId === cp.trackId && x.start < clipEnd(cp) - EPS && clipEnd(x) > cp.start + EPS)) {
          // the spot after the group is taken: use another free track of the same kind rather than overwrite
          seq = { ...seq, clips };
          const r = resolveTrack({ ...seq, tracks: seq.tracks }, null, trackKindFor(cp), [cp.start, clipEnd(cp)], main);
          seq = r.seq;
          cp.trackId = r.id;
          cp.transitionIn = null;
        }
        clips.push(cp);
        placed.push(cp);
      }
      return commit(st, { ...seq, clips }, { selection: placed.map((c) => c.id), moved: new Set(placed.map((c) => c.id)) });
    }

    case 'COPY': {
      const ids = withLinked(s, a.ids);
      const src = s.clips.filter((c) => ids.includes(c.id));
      return src.length ? { ...st, clipboard: src } : st;
    }

    case 'PASTE': {
      if (!st.clipboard?.length) return st;
      const start = Math.min(...st.clipboard.map((c) => c.start));
      const linkMap = new Map<string, string>();
      let seq = s;
      let clips = [...s.clips];
      const pasted: NleClip[] = [];
      for (const c of st.clipboard) {
        let trackId = c.trackId;
        if (!seq.tracks.some((t) => t.id === trackId && !t.locked)) {
          const r = resolveTrack(seq, null, trackKindFor(c), [a.t, a.t + c.duration]);
          seq = r.seq;
          trackId = r.id;
        }
        if (c.linkId && !linkMap.has(c.linkId)) linkMap.set(c.linkId, uid('l'));
        const cp = { ...c, id: uid('c'), trackId, start: a.t + (c.start - start), linkId: c.linkId ? linkMap.get(c.linkId) ?? null : null };
        clips = overwrite(clips, trackId, cp.start, clipEnd(cp), new Set());
        clips.push(cp);
        pasted.push(cp);
      }
      return commit(st, { ...seq, clips }, { selection: pasted.map((c) => c.id), moved: new Set(pasted.map((c) => c.id)) });
    }

    case 'UPDATE_CLIPS': {
      const set = new Set(a.ids);
      if (!set.size) return st;
      const rateOf = new Map<string, number>();
      const clips = s.clips.map((c) => {
        if (!set.has(c.id)) return c;
        const p: Partial<NleClip> = { ...(a.patch ?? {}), ...(a.patches?.[c.id] ?? {}) };
        const n: NleClip = { ...c, ...p };
        if (a.transformPatch) n.transform = { ...n.transform, ...a.transformPatch };
        // speed change keeps the consumed source: duration = consumed / rate
        if (p.rate && p.rate !== c.rate && p.duration === undefined) {
          const consumed = c.duration * c.rate;
          n.duration = Math.max(MIN_CLIP, Math.min(consumed / p.rate, maxDuration(n)));
          if (c.linkId) rateOf.set(c.linkId, p.rate);
        }
        if (p.duration !== undefined) n.duration = clamp(p.duration, MIN_CLIP, maxDuration(n));
        return n;
      });
      // rate changes carry to linked partners so picture and detached sound stay in sync
      const out = rateOf.size
        ? clips.map((c) => {
            const r = !set.has(c.id) && c.linkId ? rateOf.get(c.linkId) : undefined;
            return r ? { ...c, rate: r, duration: Math.max(MIN_CLIP, (c.duration * c.rate) / r) } : c;
          })
        : clips;
      return commit(st, { ...s, clips: out }, { key: a.key ? `upd:${a.ids.join(',')}:${a.key}` : undefined });
    }

    case 'SET_TRANSITION': {
      const c = byId(s, a.id);
      if (!c || c.kind === 'audio') return st;
      const tr = a.transition ? { ...a.transition, duration: clamp(a.transition.duration, 0.1, Math.max(0.1, c.duration * 0.9)) } : null;
      return commit(st, { ...s, clips: s.clips.map((x) => (x.id === a.id ? { ...x, transitionIn: tr } : x)) }, { key: `tr:${a.id}`, selection: [a.id] });
    }

    case 'DETACH_AUDIO': {
      const c = byId(s, a.id);
      if (!c || c.kind !== 'video' || !c.hasAudio || c.muted) return st;
      const link = c.linkId ?? uid('l');
      const r = resolveTrack(s, null, 'audio', [c.start, clipEnd(c)]);
      const audio: NleClip = { ...c, id: uid('c'), kind: 'audio', trackId: r.id, name: `${c.name} (audio)`, linkId: link, transitionIn: null, transformEnd: null, muted: false, text: null };
      const clips = overwrite(r.seq.clips, r.id, c.start, clipEnd(c), new Set()).map((x) => (x.id === c.id ? { ...x, muted: true, linkId: link } : x));
      return commit(st, { ...r.seq, clips: [...clips, audio] }, { selection: [audio.id] });
    }

    case 'UNLINK': {
      const c = byId(s, a.id);
      if (!c?.linkId) return st;
      const link = c.linkId;
      return commit(st, { ...s, clips: s.clips.map((x) => (x.linkId === link ? { ...x, linkId: null } : x)) });
    }

    case 'NUDGE': {
      if (!a.ids.length) return st;
      const first = byId(s, a.ids[0]);
      if (!first) return st;
      return nleReducer(st, { type: 'MOVE_CLIPS', ids: a.ids, anchorId: first.id, dt: a.frames / (s.fps || 30), toTrack: null });
    }

    case 'ADD_TRACK':
      return commit(st, addTrack(s, a.kind).seq);
    case 'REMOVE_TRACK': {
      const t = s.tracks.find((x) => x.id === a.id);
      if (!t) return st;
      if (s.tracks.filter((x) => x.kind === t.kind).length <= 1) return st; // keep one of each kind
      return commit(st, { ...s, tracks: s.tracks.filter((x) => x.id !== a.id), clips: s.clips.filter((c) => c.trackId !== a.id) });
    }
    case 'UPDATE_TRACK':
      return commit(st, { ...s, tracks: s.tracks.map((t) => (t.id === a.id ? { ...t, ...a.patch } : t)) });

    case 'ADD_MARKER': {
      const t = frameSnap(a.t, s.fps || 30);
      if (s.markers.some((m) => Math.abs(m.t - t) < 1e-3)) return st;
      const m: NleMarker = { id: uid('m'), t, label: a.label ?? `Marker ${s.markers.length + 1}`, color: '#F5A623' };
      return commit(st, { ...s, markers: [...s.markers, m].sort((x, y) => x.t - y.t) });
    }
    case 'UPDATE_MARKER':
      return commit(st, { ...s, markers: s.markers.map((m) => (m.id === a.id ? { ...m, ...a.patch } : m)).sort((x, y) => x.t - y.t) }, { key: `mk:${a.id}` });
    case 'REMOVE_MARKER':
      return commit(st, { ...s, markers: s.markers.filter((m) => m.id !== a.id) });

    case 'SELECT': {
      if (!a.additive) return { ...st, selection: a.ids };
      const cur = new Set(st.selection);
      for (const id of a.ids) {
        if (cur.has(id)) cur.delete(id);
        else cur.add(id);
      }
      return { ...st, selection: [...cur] };
    }
    case 'SELECT_ALL':
      return { ...st, selection: s.clips.map((c) => c.id) };

    case 'SEEK':
      return { ...st, playhead: clamp(a.t, 0, sequenceDuration(s) + 600) };
    case 'TICK': {
      if (!st.playing) return st;
      const dur = sequenceDuration(s);
      const t = st.playhead + a.dt;
      if (t >= dur) return { ...st, playhead: dur, playing: false };
      return { ...st, playhead: t };
    }
    case 'SET_PLAYING': {
      const dur = sequenceDuration(s);
      if (a.playing && dur <= 0) return st;
      return { ...st, playing: a.playing, playhead: a.playing && st.playhead >= dur - 1e-3 ? 0 : st.playhead };
    }
    case 'TOGGLE_PLAY':
      return nleReducer(st, { type: 'SET_PLAYING', playing: !st.playing });
    case 'STEP': {
      const fps = s.fps || 30;
      return { ...st, playing: false, playhead: clamp(frameSnap(st.playhead, fps) + a.frames / fps, 0, sequenceDuration(s) + 600) };
    }
    case 'SET_ZOOM':
      return { ...st, pps: clamp(a.pps, 2, 600) };
    case 'TOGGLE_SNAP':
      return { ...st, snap: !st.snap };
    case 'TOGGLE_MAGNETIC': {
      const magnetic = !st.magnetic;
      return magnetic ? commit({ ...st, magnetic }, s) : { ...st, magnetic };
    }
    case 'SET_TOOL':
      return { ...st, tool: a.tool };
    case 'SET_LEFT_TAB':
      return { ...st, leftTab: a.tab };

    case 'UNDO': {
      const prev = st.past[st.past.length - 1];
      if (!prev) return st;
      return { ...st, seq: prev, past: st.past.slice(0, -1), future: [st.seq, ...st.future].slice(0, HISTORY), lastKey: null, saved: 'dirty' };
    }
    case 'REDO': {
      const next = st.future[0];
      if (!next) return st;
      return { ...st, seq: next, past: [...st.past, st.seq].slice(-HISTORY), future: st.future.slice(1), lastKey: null, saved: 'dirty' };
    }
    default:
      return st;
  }
}

/** Times a dragged edge / clip may snap to: 0, clip edges (except `exclude`), markers, playhead. */
export function snapPoints(st: NleState, exclude: Set<string>): number[] {
  const pts = [0, st.playhead];
  for (const c of st.seq.clips) if (!exclude.has(c.id)) pts.push(c.start, clipEnd(c));
  for (const m of st.seq.markers) pts.push(m.t);
  return pts;
}

/** Nearest snap point within `px` pixels at zoom pps, or null. */
export function snapNear(t: number, pts: number[], pps: number, px = 8): number | null {
  let best: number | null = null;
  let bestD = px / pps;
  for (const p of pts) {
    const d = Math.abs(p - t);
    if (d <= bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}
