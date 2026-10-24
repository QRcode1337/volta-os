// VOLTA Editor — local types (shared types live in @/types/os and are not edited here).
import type { VideoClip, VideoPinComment } from '@/types/os';

export type SkillTag = '/animate' | '/cut' | 'audio' | '/robo';
export type ClipStatus = VideoClip['status'];
export type ClipFilter = 'all' | 'needs-review' | 'changes-requested' | 'approved' | 'has-pins';
export type PinMode = 'point' | 'box';
export type InspectorTab = 'comments' | 'script';
export type GroupMode = 'clip' | 'chrono';
export type PlaybackSpeed = 0.5 | 1 | 1.5 | 2;

export interface EditorClip extends VideoClip {
  origin: 'seed' | 'inbox' | 'file';
  /** object URL of a locally imported MP4/WebM (never persisted) */
  videoUrl?: string;
  fileName?: string;
  /** data URL of a captured frame for file clips */
  thumbUrl?: string;
}

/** Percent box relative to the 16:9 frame. */
export interface RegionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

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
  project: string;
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
