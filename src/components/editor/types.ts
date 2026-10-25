// VOLTA Editor: local client types (shared server/client shapes live in @/types/editor).
import type { EditorClipStatus, EditorMediaKind, EditorProjectKind, EditorSkillTag } from '@/types/editor';
import type { VideoPinComment } from '@/types/os';

export type SkillTag = EditorSkillTag;
export type ClipStatus = EditorClipStatus;
export type ClipFilter = 'all' | 'needs-review' | 'changes-requested' | 'approved' | 'has-pins';
export type PinMode = 'point' | 'box';
export type InspectorTab = 'comments' | 'script';
export type GroupMode = 'clip' | 'chrono';
export type PlaybackSpeed = 0.5 | 1 | 1.5 | 2;

/** Notes persistence for one open file. */
export type NotesState = 'loading' | 'saved' | 'dirty' | 'saving' | 'error' | 'local';

/** A real file opened on the timeline. `id` is the fileKey for server files (o_... / g_...), or local-... for a session-only import. */
export interface EditorClip {
  id: string;
  number: number;
  /** File name without extension. */
  title: string;
  name: string;
  /** Absolute path (or local://name for imports). */
  path: string;
  origin: 'server' | 'local';
  media: EditorMediaKind;
  projectId: string | null;
  projectName: string;
  projectKind: EditorProjectKind;
  projectPath: string | null;
  kind: 'ANIMATION' | 'A-ROLL CUT';
  status: ClipStatus;
  /** Position on the master timeline. */
  startSec: number;
  durationSec: number;
  fps: number;
  /** True when fps came from ffprobe (false: assumed 30). */
  fpsKnown: boolean;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  /** Range-capable URL (server files) or an object URL (local imports, never persisted). */
  url: string;
  animationLabel: string;
  /** Script lines handed over with the file (Scripts hand-offs); relative to the clip start. */
  voiceover: { atSec: number; text: string }[];
  canSaveNotes: boolean;
  thumbUrl?: string;
}

/** Percent box relative to the video frame. */
export interface RegionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** In memory, `timestampSec` is on the MASTER timeline; it is stored per file relative to the file start. */
export interface EditorPin extends VideoPinComment {
  number: number;
  skill: SkillTag;
  resolved: boolean;
  region?: RegionBox;
  /** Set when the pin was created from a highlighted voiceover sentence. */
  scriptLine?: string;
}

export interface PinDraft {
  clipId: string;
  timestampSec: number;
  xPercent: number;
  yPercent: number;
  region?: RegionBox;
}

export interface EditorState {
  hydrated: boolean;
  clips: EditorClip[];
  pins: EditorPin[];
  /** master-timeline seconds */
  playhead: number;
  playing: boolean;
  speed: PlaybackSpeed;
  loop: boolean;
  mode: PinMode;
  teachCut: boolean;
  teachAnimate: boolean;
  filter: ClipFilter;
  tab: InspectorTab;
  group: GroupMode;
  /** Clip selected from the bin: inspector filters to it, timeline isolates it. */
  focusClipId: string | null;
  draft: PinDraft | null;
  pulse: { id: string; nonce: number } | null;
  isolate: { clipId: string | null; nonce: number } | null;
  editingPinId: string | null;
  nonce: number;
  /** File keys that were open last time; reopened once the media bin has loaded. */
  restoreIds: string[];
}

export const SKILL_OPTIONS: { tag: SkillTag; label: string; short: string }[] = [
  { tag: '/animate', label: 'Animation (/animate)', short: '/animate' },
  { tag: '/cut', label: 'Cut / Pacing (/cut)', short: '/cut' },
  { tag: 'audio', label: 'Audio / SFX', short: 'audio' },
  { tag: '/robo', label: 'Typography (/robo)', short: '/robo' },
];

export const SKILL_COLORS: Record<SkillTag, string> = {
  '/animate': '#FF5500',
  '/cut': '#14B8A6',
  audio: '#A855F7',
  '/robo': '#F5A623',
};

export const STATUS_ORDER: ClipStatus[] = ['NEEDS REVIEW', 'CHANGES REQUESTED', 'APPROVED'];

export const DEFAULT_FPS = 30;
/** A still image is held on the timeline for this long. */
export const STILL_SECONDS = 5;
