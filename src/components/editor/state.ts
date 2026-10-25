// VOLTA Editor: reducer, selectors and persistence helpers (pure; no DOM at module scope).
import type { EditorEpisodeRef, EditorMediaItem, EditorPinRecord } from '@/types/editor';
import type { EditorInboxItem } from '@/types/os';
import { formatClock } from './spatial';
import type { ClipFilter, ClipStatus, EditorClip, EditorPin, EditorState, GroupMode, InspectorTab, PinDraft, PinMode, PlaybackSpeed, SkillTag } from './types';
import { DEFAULT_FPS, STATUS_ORDER, STILL_SECONDS } from './types';

export const STORAGE_KEY = 'rubric:editor-state';
const PIN_WINDOW = 1.5;

export function initialState(): EditorState {
  return {
    hydrated: false,
    clips: [],
    pins: [],
    playhead: 0,
    playing: false,
    speed: 1,
    loop: false,
    mode: 'point',
    teachCut: true,
    teachAnimate: true,
    filter: 'all',
    tab: 'comments',
    group: 'clip',
    focusClipId: null,
    draft: null,
    pulse: null,
    isolate: null,
    editingPinId: null,
    nonce: 1,
    restoreIds: [],
  };
}

// ───────────────────────── clips from real files ─────────────────────────

export type NewClip = Omit<EditorClip, 'startSec' | 'number'>;

/** A bin / inbox item -> a timeline clip. `durationOverride` is used when ffprobe had no duration (browser-probed). */
export function clipFromMedia(item: EditorMediaItem, extra: { durationOverride?: number; voiceover?: EditorClip['voiceover'] } = {}): NewClip {
  const dur = item.media === 'image' ? STILL_SECONDS : item.durationSec ?? extra.durationOverride ?? 0;
  const animated = item.projectKind === 'remotion' || item.projectKind === 'hyperframes' || (item.source === 'generations' && item.media === 'video');
  return {
    id: item.id,
    title: item.name.replace(/\.[^.]+$/, '') || item.name,
    name: item.name,
    path: item.path,
    origin: 'server',
    media: item.media,
    projectId: item.projectId,
    projectName: item.groupName,
    projectKind: item.projectKind,
    projectPath: item.projectPath,
    kind: animated ? 'ANIMATION' : 'A-ROLL CUT',
    status: 'NEEDS REVIEW',
    durationSec: Math.max(0.5, Math.round(dur * 1000) / 1000),
    fps: item.fps && item.fps > 0 ? item.fps : DEFAULT_FPS,
    fpsKnown: !!(item.fps && item.fps > 0),
    width: item.width,
    height: item.height,
    hasAudio: item.hasAudio,
    url: item.url,
    animationLabel: item.groupName,
    voiceover: extra.voiceover ?? [],
    canSaveNotes: item.canSaveNotes,
    episode: null,
  };
}

/** Inbox hand-off -> the fileKey it points at, or null when it carries no real file (Scripts / Carousels items). */
export function inboxFileKey(item: EditorInboxItem): string | null {
  const m = /^\/api\/(studio|media|music)\/file\?id=([A-Za-z0-9_-]+)$/.exec(item.mediaUrl ?? '');
  if (!m) return null;
  return m[1] === 'media' ? `g_${m[2]}` : m[2]; // studio: o_<hex>, music: m_<hex> (already prefixed)
}

export function inboxVoiceover(item: EditorInboxItem): EditorClip['voiceover'] {
  return (Array.isArray(item.cues) ? item.cues : [])
    .filter((c) => c && typeof c.voiceover === 'string')
    .map((c) => ({ atSec: Math.max(0, Number(c.atSec) || 0), text: c.voiceover }))
    .sort((a, b) => a.atSec - b.atSec);
}

// ───────────────────────── pins <-> records ─────────────────────────

export function pinsFromRecords(records: EditorPinRecord[], clip: EditorClip, firstNumber: number): EditorPin[] {
  return [...records]
    .sort((a, b) => a.timestampSec - b.timestampSec || a.number - b.number)
    .map((r, i) => {
      const local = Math.min(clip.durationSec, Math.max(0, r.timestampSec));
      return {
        id: r.id,
        number: firstNumber + i,
        clipId: clip.id,
        timestampSec: clip.startSec + local,
        formattedTime: formatClock(local),
        xPercent: r.xPercent,
        yPercent: r.yPercent,
        region: r.region,
        commentText: r.commentText,
        skill: r.skill,
        resolved: r.resolved,
        scriptLine: r.scriptLine,
      };
    });
}

export function recordsFromPins(pins: EditorPin[], clip: EditorClip): EditorPinRecord[] {
  return pins
    .filter((p) => p.clipId === clip.id)
    .map((p) => ({
      id: p.id,
      number: p.number,
      timestampSec: Math.max(0, Math.round((p.timestampSec - clip.startSec) * 1000) / 1000),
      xPercent: p.xPercent,
      yPercent: p.yPercent,
      region: p.region,
      commentText: p.commentText,
      skill: p.skill,
      resolved: p.resolved,
      scriptLine: p.scriptLine,
    }));
}

// ───────────────────────── selectors ─────────────────────────

export function totalDuration(clips: EditorClip[]): number {
  return clips.reduce((m, c) => Math.max(m, c.startSec + c.durationSec), 0);
}

export function clipAt(clips: EditorClip[], t: number): EditorClip | null {
  if (clips.length === 0) return null;
  for (const c of clips) if (t >= c.startSec && t < c.startSec + c.durationSec) return c;
  return t >= totalDuration(clips) ? clips[clips.length - 1] : clips[0];
}

export function nextPinNumber(pins: EditorPin[]): number {
  return pins.reduce((m, p) => Math.max(m, p.number), 0) + 1;
}

export function isPinVisibleAt(p: EditorPin, t: number): boolean {
  return Math.abs(p.timestampSec - t) <= PIN_WINDOW;
}

export function clipMatchesFilter(c: EditorClip, pins: EditorPin[], f: ClipFilter): boolean {
  switch (f) {
    case 'needs-review':
      return c.status === 'NEEDS REVIEW';
    case 'changes-requested':
      return c.status === 'CHANGES REQUESTED';
    case 'approved':
      return c.status === 'APPROVED';
    case 'has-pins':
      return pins.some((p) => p.clipId === c.id);
    default:
      return true;
  }
}

const snapTo = (t: number, fps: number) => Math.round(t * fps) / fps;

/** Re-pack clips contiguously by number; shift each clip's pins by the clip's start delta (local times are unchanged). */
export function relayout(clips: EditorClip[], pins: EditorPin[]): { clips: EditorClip[]; pins: EditorPin[] } {
  const sorted = [...clips].sort((a, b) => a.number - b.number);
  let start = 0;
  const delta = new Map<string, number>();
  const out = sorted.map((c) => {
    delta.set(c.id, start - c.startSec);
    const next = { ...c, startSec: start };
    start += c.durationSec;
    return next;
  });
  const ids = new Set(out.map((c) => c.id));
  const outPins = pins
    .filter((p) => ids.has(p.clipId))
    .map((p) => {
      const d = delta.get(p.clipId) ?? 0;
      return d ? { ...p, timestampSec: p.timestampSec + d } : p;
    });
  return { clips: out, pins: outPins };
}

// ───────────────────────── persistence (toggles + which files were open) ─────────────────────────

export interface PersistedState {
  v: 2;
  teachCut: boolean;
  teachAnimate: boolean;
  group: GroupMode;
  /** fileKeys of the open server files, in timeline order. Pins live on disk per file, not here. */
  open: string[];
}

export function toPersisted(s: EditorState): PersistedState {
  return { v: 2, teachCut: s.teachCut, teachAnimate: s.teachAnimate, group: s.group, open: s.clips.filter((c) => c.origin === 'server').map((c) => c.id) };
}

export function parsePersisted(raw: string | null): PersistedState | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as PersistedState | null;
    return o && o.v === 2 && Array.isArray(o.open) ? o : null;
  } catch {
    return null;
  }
}

// ───────────────────────── actions ─────────────────────────

export type EditorAction =
  | { type: 'HYDRATE'; saved: PersistedState | null }
  | { type: 'TICK'; dt: number }
  | { type: 'SEEK'; t: number }
  | { type: 'STEP'; frames: number }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'SET_SPEED'; speed: PlaybackSpeed }
  | { type: 'TOGGLE_LOOP' }
  | { type: 'SET_MODE'; mode: PinMode }
  | { type: 'TOGGLE_TEACH'; skill: 'cut' | 'animate' }
  | { type: 'SET_FILTER'; filter: ClipFilter }
  | { type: 'SET_TAB'; tab: InspectorTab }
  | { type: 'SET_GROUP'; group: GroupMode }
  | { type: 'SELECT_CLIP'; clipId: string }
  | { type: 'CLEAR_FOCUS' }
  | { type: 'START_DRAFT'; draft: PinDraft }
  | { type: 'CANCEL_DRAFT' }
  | { type: 'SAVE_DRAFT'; text: string; skill: SkillTag }
  | { type: 'ADD_SCRIPT_PIN'; clipId: string; timestampSec: number; skill: SkillTag; text: string; line: string }
  | { type: 'UPDATE_PIN'; id: string; patch: Partial<Pick<EditorPin, 'commentText' | 'skill' | 'resolved'>> }
  | { type: 'DELETE_PIN'; id: string }
  | { type: 'PULSE_PIN'; id: string; seek: boolean }
  | { type: 'CLEAR_PULSE' }
  | { type: 'NEXT_PIN' }
  | { type: 'SET_CLIP_STATUS'; clipId: string; status: ClipStatus }
  | { type: 'CYCLE_CLIP_STATUS'; clipId: string }
  | { type: 'ADD_CLIPS'; clips: NewClip[]; select?: boolean }
  | { type: 'LOAD_PINS'; clipId: string; records: EditorPinRecord[]; status?: ClipStatus; episode?: EditorEpisodeRef | null }
  | { type: 'SET_EPISODE'; clipId: string; episode: EditorEpisodeRef | null }
  | { type: 'REMOVE_CLIP'; clipId: string }
  | { type: 'SET_EDITING'; id: string | null }
  | { type: 'CLEAR_TIMELINE' };

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  const total = totalDuration(s.clips);
  switch (a.type) {
    case 'HYDRATE': {
      if (!a.saved) return { ...s, hydrated: true };
      return { ...s, hydrated: true, teachCut: !!a.saved.teachCut, teachAnimate: !!a.saved.teachAnimate, group: a.saved.group === 'chrono' ? 'chrono' : 'clip', restoreIds: a.saved.open.filter((x) => typeof x === 'string').slice(0, 24) };
    }
    case 'TICK': {
      if (!s.playing || total <= 0) return s;
      let t = s.playhead + a.dt * s.speed;
      if (s.loop) {
        const c = clipAt(s.clips, s.playhead);
        if (c && t >= c.startSec + c.durationSec) t = c.startSec + ((t - c.startSec) % c.durationSec);
      } else if (t >= total) {
        return { ...s, playhead: total, playing: false };
      }
      return { ...s, playhead: t };
    }
    case 'SEEK':
      return { ...s, playhead: Math.max(0, Math.min(total, a.t)) };
    case 'STEP': {
      const fps = clipAt(s.clips, s.playhead)?.fps ?? DEFAULT_FPS;
      return { ...s, playing: false, playhead: Math.max(0, Math.min(total, snapTo(s.playhead, fps) + a.frames / fps)) };
    }
    case 'SET_PLAYING':
      return { ...s, playing: a.playing && total > 0, playhead: a.playing && s.playhead >= total ? 0 : s.playhead, draft: a.playing ? null : s.draft };
    case 'TOGGLE_PLAY':
      return editorReducer(s, { type: 'SET_PLAYING', playing: !s.playing });
    case 'SET_SPEED':
      return { ...s, speed: a.speed };
    case 'TOGGLE_LOOP':
      return { ...s, loop: !s.loop };
    case 'SET_MODE':
      return { ...s, mode: a.mode };
    case 'TOGGLE_TEACH':
      return a.skill === 'cut' ? { ...s, teachCut: !s.teachCut } : { ...s, teachAnimate: !s.teachAnimate };
    case 'SET_FILTER':
      return { ...s, filter: a.filter };
    case 'SET_TAB':
      return { ...s, tab: a.tab };
    case 'SET_GROUP':
      return { ...s, group: a.group };
    case 'SELECT_CLIP': {
      const c = s.clips.find((x) => x.id === a.clipId);
      if (!c) return s;
      return { ...s, playhead: c.startSec, playing: false, focusClipId: c.id, isolate: { clipId: c.id, nonce: s.nonce }, nonce: s.nonce + 1, draft: null };
    }
    case 'CLEAR_FOCUS':
      return { ...s, focusClipId: null, isolate: { clipId: null, nonce: s.nonce }, nonce: s.nonce + 1 };
    case 'START_DRAFT':
      return { ...s, playing: false, draft: a.draft };
    case 'CANCEL_DRAFT':
      return { ...s, draft: null };
    case 'SAVE_DRAFT': {
      if (!s.draft || !a.text.trim()) return s;
      const d = s.draft;
      const clip = s.clips.find((c) => c.id === d.clipId);
      if (!clip) return { ...s, draft: null };
      const pin: EditorPin = {
        id: `pin-${Date.now().toString(36)}-${s.nonce}`,
        number: nextPinNumber(s.pins),
        clipId: d.clipId,
        timestampSec: d.timestampSec,
        formattedTime: formatClock(d.timestampSec - clip.startSec),
        xPercent: d.xPercent,
        yPercent: d.yPercent,
        region: d.region,
        commentText: a.text.trim(),
        skill: a.skill,
        resolved: false,
      };
      return { ...s, pins: [...s.pins, pin], draft: null, nonce: s.nonce + 1, pulse: { id: pin.id, nonce: s.nonce } };
    }
    case 'ADD_SCRIPT_PIN': {
      const clip = s.clips.find((c) => c.id === a.clipId);
      if (!clip) return s;
      const pin: EditorPin = {
        id: `pin-${Date.now().toString(36)}-${s.nonce}`,
        number: nextPinNumber(s.pins),
        clipId: a.clipId,
        timestampSec: a.timestampSec,
        formattedTime: formatClock(a.timestampSec - clip.startSec),
        xPercent: 50,
        yPercent: 88,
        commentText: a.text,
        skill: a.skill,
        resolved: false,
        scriptLine: a.line,
      };
      return { ...s, pins: [...s.pins, pin], nonce: s.nonce + 1, tab: 'comments', editingPinId: pin.id, pulse: { id: pin.id, nonce: s.nonce }, playhead: a.timestampSec, playing: false };
    }
    case 'UPDATE_PIN':
      return { ...s, pins: s.pins.map((p) => (p.id === a.id ? { ...p, ...a.patch } : p)) };
    case 'DELETE_PIN':
      return { ...s, pins: s.pins.filter((p) => p.id !== a.id), editingPinId: s.editingPinId === a.id ? null : s.editingPinId };
    case 'PULSE_PIN': {
      const p = s.pins.find((x) => x.id === a.id);
      if (!p) return s;
      return { ...s, pulse: { id: p.id, nonce: s.nonce }, nonce: s.nonce + 1, ...(a.seek ? { playhead: p.timestampSec, playing: false, draft: null } : {}) };
    }
    case 'CLEAR_PULSE':
      return s.pulse ? { ...s, pulse: null } : s;
    case 'NEXT_PIN': {
      const sorted = [...s.pins].sort((x, y) => x.timestampSec - y.timestampSec || x.number - y.number);
      if (!sorted.length) return s;
      const fps = clipAt(s.clips, s.playhead)?.fps ?? DEFAULT_FPS;
      const next = sorted.find((p) => p.timestampSec > s.playhead + 0.5 / fps) ?? sorted[0];
      return { ...s, playhead: next.timestampSec, playing: false, draft: null, pulse: { id: next.id, nonce: s.nonce }, nonce: s.nonce + 1 };
    }
    case 'SET_CLIP_STATUS':
      return { ...s, clips: s.clips.map((c) => (c.id === a.clipId ? { ...c, status: a.status } : c)) };
    case 'CYCLE_CLIP_STATUS':
      return {
        ...s,
        clips: s.clips.map((c) => (c.id === a.clipId ? { ...c, status: STATUS_ORDER[(STATUS_ORDER.indexOf(c.status) + 1) % STATUS_ORDER.length] } : c)),
      };
    case 'ADD_CLIPS': {
      const existing = new Set(s.clips.map((c) => c.id));
      let num = s.clips.reduce((m, c) => Math.max(m, c.number), 0);
      let start = total;
      const added: EditorClip[] = [];
      for (const c of a.clips) {
        if (existing.has(c.id)) continue;
        num += 1;
        added.push({ ...c, number: num, startSec: start });
        start += c.durationSec;
      }
      if (!added.length) {
        // Already on the timeline: just select it.
        const dup = a.select ? a.clips.map((c) => s.clips.find((x) => x.id === c.id)).find(Boolean) : undefined;
        return dup ? editorReducer(s, { type: 'SELECT_CLIP', clipId: dup.id }) : s;
      }
      const first = added[0];
      return {
        ...s,
        clips: [...s.clips, ...added],
        ...(a.select ? { playhead: first.startSec, playing: false, focusClipId: first.id, isolate: { clipId: first.id, nonce: s.nonce }, nonce: s.nonce + 1 } : {}),
      };
    }
    case 'LOAD_PINS': {
      const clip = s.clips.find((c) => c.id === a.clipId);
      if (!clip) return s;
      const others = s.pins.filter((p) => p.clipId !== clip.id);
      const loaded = pinsFromRecords(a.records, clip, nextPinNumber(others));
      return {
        ...s,
        pins: [...others, ...loaded],
        clips: a.status || a.episode !== undefined ? s.clips.map((c) => (c.id === clip.id ? { ...c, status: (a.status ?? c.status) as ClipStatus, episode: a.episode !== undefined ? a.episode : c.episode } : c)) : s.clips,
      };
    }
    case 'SET_EPISODE':
      return { ...s, clips: s.clips.map((c) => (c.id === a.clipId ? { ...c, episode: a.episode } : c)) };
    case 'REMOVE_CLIP': {
      const c = s.clips.find((x) => x.id === a.clipId);
      if (!c) return s;
      const lay = relayout(
        s.clips.filter((x) => x.id !== a.clipId),
        s.pins.filter((p) => p.clipId !== a.clipId),
      );
      const nt = totalDuration(lay.clips);
      return {
        ...s,
        ...lay,
        playing: s.playing && nt > 0,
        playhead: Math.min(s.playhead, nt),
        focusClipId: s.focusClipId === a.clipId ? null : s.focusClipId,
        draft: s.draft?.clipId === a.clipId ? null : s.draft,
        editingPinId: s.pins.some((p) => p.id === s.editingPinId && p.clipId === a.clipId) ? null : s.editingPinId,
      };
    }
    case 'SET_EDITING':
      return { ...s, editingPinId: a.id };
    case 'CLEAR_TIMELINE':
      return { ...s, clips: [], pins: [], playhead: 0, playing: false, draft: null, focusClipId: null, editingPinId: null, pulse: null, isolate: { clipId: null, nonce: s.nonce }, nonce: s.nonce + 1 };
    default:
      return s;
  }
}
