// VOLTA Editor — reducer, seed state and persistence helpers (pure; no DOM at module scope).
import { EDITOR_FPS, EDITOR_PROJECTS, EDITOR_SCENE_KEYS, SEED_PINS, VIDEO_CLIPS, formatHMS } from '@/lib/mock-data';
import type { EditorInboxItem } from '@/types/os';
import type { ClipFilter, ClipStatus, EditorClip, EditorPin, EditorState, GroupMode, InspectorTab, PinDraft, PinMode, PlaybackSpeed, SkillTag } from './types';
import { STATUS_ORDER } from './types';

export const STORAGE_KEY = 'rubric:editor-state';
const PIN_WINDOW = 1.5;

export function seedClips(): EditorClip[] {
  return VIDEO_CLIPS.map((c) => ({ ...c, voiceover: c.voiceover.map((v) => ({ ...v })), origin: 'seed' as const }));
}

export function seedPins(): EditorPin[] {
  return SEED_PINS.map((p, i) => ({ ...p, number: i + 1 }));
}

export function initialState(): EditorState {
  return {
    hydrated: false,
    project: EDITOR_PROJECTS[0],
    clips: seedClips(),
    pins: seedPins(),
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
  };
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

const snap = (t: number) => Math.round(t * EDITOR_FPS) / EDITOR_FPS;

/** Re-pack clips contiguously by number; shift each clip's pins by the clip's start delta. */
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
      if (!d) return p;
      const ts = p.timestampSec + d;
      return { ...p, timestampSec: ts, formattedTime: formatHMS(ts) };
    });
  return { clips: out, pins: outPins };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'clip';
}

export function inboxItemToClip(item: EditorInboxItem, number: number): Omit<EditorClip, 'startSec'> {
  const dur = Math.max(2, Math.min(600, Number(item.durationSec) || 10));
  const key = (EDITOR_SCENE_KEYS as readonly string[]).includes(item.sceneKey ?? '') ? (item.sceneKey as string) : 'title-reveal';
  const cues = Array.isArray(item.cues) ? item.cues : [];
  return {
    id: `inbox-${item.id}`,
    number,
    title: String(item.title || 'Untitled hand-off').slice(0, 80),
    kind: item.kind === 'A-ROLL CUT' ? 'A-ROLL CUT' : 'ANIMATION',
    status: 'NEEDS REVIEW',
    durationSec: dur,
    sourcePath: `workspace/videos/clips/${String(number).padStart(2, '0')}-${slug(item.title || 'handoff')}.tsx`,
    sceneKey: key,
    animationLabel: cues[0]?.visualCue?.slice(0, 28) || `${item.source} hand-off`,
    voiceover: cues
      .filter((c) => c && typeof c.voiceover === 'string')
      .map((c) => ({ atSec: Math.max(0, Math.min(dur - 0.5, Number(c.atSec) || 0)), text: c.voiceover }))
      .sort((a, b) => a.atSec - b.atSec),
    origin: 'inbox',
  };
}

// ───────────────────────── persistence ─────────────────────────

export interface PersistedState {
  v: 1;
  project: string;
  teachCut: boolean;
  teachAnimate: boolean;
  group: GroupMode;
  clips: EditorClip[];
  pins: EditorPin[];
}

export function toPersisted(s: EditorState): PersistedState {
  const clips = s.clips.filter((c) => c.origin !== 'file').map(({ videoUrl: _v, thumbUrl: _t, ...rest }) => rest);
  const ids = new Set(clips.map((c) => c.id));
  return { v: 1, project: s.project, teachCut: s.teachCut, teachAnimate: s.teachAnimate, group: s.group, clips, pins: s.pins.filter((p) => ids.has(p.clipId)) };
}

function isPersisted(x: unknown): x is PersistedState {
  const o = x as PersistedState | null;
  return !!o && o.v === 1 && Array.isArray(o.clips) && Array.isArray(o.pins);
}

export function parsePersisted(raw: string | null): PersistedState | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    return isPersisted(o) ? o : null;
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
  | { type: 'SET_PROJECT'; project: string }
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
  | { type: 'ADD_CLIPS'; clips: Omit<EditorClip, 'startSec' | 'number'>[]; select?: boolean }
  | { type: 'REMOVE_CLIP'; clipId: string }
  | { type: 'SET_EDITING'; id: string | null }
  | { type: 'RESET' };

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  const total = totalDuration(s.clips);
  switch (a.type) {
    case 'HYDRATE': {
      if (!a.saved) return { ...s, hydrated: true };
      const sv = a.saved;
      const seedIds = new Set(VIDEO_CLIPS.map((c) => c.id));
      // keep seed clips authoritative for content, but honour persisted status
      const savedById = new Map(sv.clips.map((c) => [c.id, c]));
      const base = seedClips().map((c) => ({ ...c, status: savedById.get(c.id)?.status ?? c.status }));
      const extra = sv.clips.filter((c) => !seedIds.has(c.id) && typeof c.durationSec === 'number').map((c) => ({ ...c, origin: 'inbox' as const }));
      const pins = sv.pins
        .filter((p) => p && typeof p.timestampSec === 'number' && typeof p.id === 'string')
        .map((p, i) => ({ ...p, number: typeof p.number === 'number' ? p.number : i + 1, skill: p.skill ?? '/animate', resolved: !!p.resolved }));
      const lay = relayout([...base, ...extra], pins);
      return {
        ...s,
        hydrated: true,
        project: (EDITOR_PROJECTS as readonly string[]).includes(sv.project) ? sv.project : s.project,
        teachCut: !!sv.teachCut,
        teachAnimate: !!sv.teachAnimate,
        group: sv.group === 'chrono' ? 'chrono' : 'clip',
        clips: lay.clips,
        pins: lay.pins,
      };
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
    case 'STEP':
      return { ...s, playing: false, playhead: Math.max(0, Math.min(total, snap(s.playhead) + a.frames / EDITOR_FPS)) };
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
    case 'SET_PROJECT':
      return { ...s, project: a.project };
    case 'SELECT_CLIP': {
      const c = s.clips.find((x) => x.id === a.clipId);
      if (!c) return s;
      return { ...s, playhead: c.startSec, focusClipId: c.id, isolate: { clipId: c.id, nonce: s.nonce }, nonce: s.nonce + 1, draft: null };
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
      const pin: EditorPin = {
        id: `pin-${s.nonce}-${Math.round(d.timestampSec * 1000)}`,
        number: nextPinNumber(s.pins),
        clipId: d.clipId,
        timestampSec: d.timestampSec,
        formattedTime: formatHMS(d.timestampSec),
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
      const pin: EditorPin = {
        id: `pin-${s.nonce}-script`,
        number: nextPinNumber(s.pins),
        clipId: a.clipId,
        timestampSec: a.timestampSec,
        formattedTime: formatHMS(a.timestampSec),
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
      const next = sorted.find((p) => p.timestampSec > s.playhead + 0.5 / EDITOR_FPS) ?? sorted[0];
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
      if (!added.length) return s;
      const first = added[0];
      return {
        ...s,
        clips: [...s.clips, ...added],
        ...(a.select ? { playhead: first.startSec, focusClipId: first.id, isolate: { clipId: first.id, nonce: s.nonce }, nonce: s.nonce + 1 } : {}),
      };
    }
    case 'REMOVE_CLIP': {
      const c = s.clips.find((x) => x.id === a.clipId);
      if (!c || c.origin === 'seed') return s;
      const lay = relayout(
        s.clips.filter((x) => x.id !== a.clipId),
        s.pins.filter((p) => p.clipId !== a.clipId),
      );
      const nt = totalDuration(lay.clips);
      return { ...s, ...lay, playhead: Math.min(s.playhead, nt), focusClipId: s.focusClipId === a.clipId ? null : s.focusClipId, draft: s.draft?.clipId === a.clipId ? null : s.draft };
    }
    case 'SET_EDITING':
      return { ...s, editingPinId: a.id };
    case 'RESET': {
      const init = initialState();
      return { ...init, hydrated: true, isolate: { clipId: null, nonce: s.nonce }, nonce: s.nonce + 1 };
    }
    default:
      return s;
  }
}
