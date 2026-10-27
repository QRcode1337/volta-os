// VOLTA Editor — Edit mode (the non-linear editor). Shared client + server shapes.
// Clip timing follows the HyperFrames model: `start` / `duration` on the sequence timeline, `mediaStart` into the
// source, `rate` = playback speed. Consumed source = duration × rate.

export type NleTrackKind = 'video' | 'audio';
/** video / image / text / color live on video tracks; audio clips live on audio tracks. */
export type NleClipKind = 'video' | 'image' | 'audio' | 'text' | 'color';

export type NleTransitionType = 'dissolve' | 'dip-black' | 'dip-white' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'zoom-in' | 'wipe-left' | 'wipe-right';
export type NleTextAnim = 'none' | 'fade' | 'pop' | 'slide-up' | 'typewriter';
export type NleFit = 'contain' | 'cover' | 'fill';
export type NleFont = 'Inter' | 'Helvetica' | 'Avenir' | 'Georgia' | 'Impact' | 'Mono';

/**
 * Placement of a visual clip inside the frame. Anchor is the clip's centre.
 * x / y: offset of the centre from the frame centre as a fraction of the frame width / height (0 = centred, 0.5 = right / bottom edge).
 * scale: 1 = the media fitted to the frame per `fit`. rotation: degrees clockwise. opacity: 0..1.
 */
export interface NleTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

/** Colour adjustments. brightness -1..1 (0), contrast 0..2 (1), saturation 0..3 (1), blur 0..40 px at sequence resolution. */
export interface NleAdjust {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
}

export interface NleTextStyle {
  content: string;
  font: NleFont;
  /** px at the sequence's native height. */
  size: number;
  color: string;
  weight: 400 | 600 | 800;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  /** Outline colour, or null. */
  stroke: string | null;
  strokeWidth: number;
  /** Box behind the text, or null. */
  background: string | null;
  letterSpacing: number;
  animIn: NleTextAnim;
  animOut: NleTextAnim;
}

export interface NleTransition {
  type: NleTransitionType;
  /** Seconds. Runs from this clip's start; the previous adjacent clip on the track is held under it (its handles, else its last frame). */
  duration: number;
}

export interface NleClip {
  id: string;
  trackId: string;
  kind: NleClipKind;
  name: string;
  /** EditorMediaItem id (o_… / g_… / m_…) or an upload id (u_…); null for text / color. */
  assetId: string | null;
  /** Range-capable URL for preview; null for text / color. */
  src: string | null;
  /** Sequence seconds. */
  start: number;
  duration: number;
  /** Seconds into the source. */
  mediaStart: number;
  /** Playback speed 0.25..4. */
  rate: number;
  /** Source length in seconds; null = unbounded (image / text / color). */
  sourceDuration: number | null;
  /** Native media size (null for text / color / audio). */
  width: number | null;
  height: number | null;
  /** Video file carries an audio stream. */
  hasAudio: boolean;
  /** 0..2 (1 = unity). Applies to audio clips and to the sound of video clips. */
  volume: number;
  muted: boolean;
  /** Audio fades, seconds. */
  fadeIn: number;
  fadeOut: number;
  fit: NleFit;
  transform: NleTransform;
  /** When set, the transform animates linearly from `transform` (clip start) to this (clip end). */
  transformEnd: NleTransform | null;
  adjust: NleAdjust;
  text: NleTextStyle | null;
  /** Solid fill for color clips. */
  color: string | null;
  transitionIn: NleTransition | null;
  /** Clips sharing a linkId move / trim / split / delete together (video + its detached audio). */
  linkId: string | null;
}

export interface NleTrack {
  id: string;
  kind: NleTrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
}

export interface NleMarker {
  id: string;
  t: number;
  label: string;
  color: string;
}

export interface NleSequence {
  v: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  /** Frame background behind every layer. */
  background: string;
  /**
   * Display order, top to bottom: video tracks first (V3, V2, V1), then audio tracks (A1, A2…).
   * Render stacking: a video track higher in this list draws on top. The LAST video track is the main (magnetic) track.
   */
  tracks: NleTrack[];
  clips: NleClip[];
  markers: NleMarker[];
  updatedAt: string;
}

// ── server API ──────────────────────────────────────────────────────────────────────────────────

export interface NleProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  duration: number;
  clips: number;
}

export interface NleExportRequest {
  sequence: NleSequence;
  /** Output height (width follows the sequence aspect); null = sequence size. */
  height: number | null;
  fps: number | null;
  quality: 'draft' | 'standard' | 'high';
  fileName: string;
}

export type NleExportStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export interface NleExportJob {
  id: string;
  status: NleExportStatus;
  /** 0..1 */
  progress: number;
  outputPath: string | null;
  /** Range-capable URL of the finished file. */
  url: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** Last lines of ffmpeg stderr (redacted). */
  log: string;
}

export interface NlePeaks {
  /** Peaks per second of source. */
  rate: number;
  /** 0..1 absolute peak per bucket. */
  peaks: number[];
  duration: number;
}

export interface NleUploadResult {
  assetId: string;
  url: string;
  name: string;
  media: 'video' | 'audio' | 'image';
  durationSec: number | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  fps: number | null;
}
