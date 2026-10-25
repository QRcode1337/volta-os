// Shared (client + server) shapes for VOLTA Studio: render queue for HyperFrames / Remotion / ffmpeg projects.

export type StudioKind = 'remotion' | 'hyperframes' | 'ffmpeg' | 'pipeline';
export type MediaClass = 'video' | 'audio';

/** What the browser may fill in for a preset. Everything is validated server-side against the config. */
export type ArgSpecPublic =
  | { type: 'file'; label: string; kinds: MediaClass[] }
  | { type: 'files'; label: string; kinds: MediaClass[]; min: number; max: number }
  | { type: 'number'; label: string; min: number; max: number; default?: number }
  | { type: 'int'; label: string; min: number; max: number; default?: number }
  | { type: 'enum'; label: string; options: string[]; default?: string }
  | { type: 'composition'; label: string };

export interface PresetPublic {
  id: string;
  label: string;
  description: string;
  /** Human-readable command with {placeholders}; the argv itself is never editable from the browser. */
  command: string;
  args: Record<string, ArgSpecPublic>;
  confirm: string | null;
  progress: 'remotion' | 'ffmpeg' | 'generic';
  /** True when the render goes to the Windsor renders folder (needs >= 3 GiB free). */
  usesWindsor: boolean;
  /** Where this preset writes when it defines its own folder. */
  outputDir: string | null;
  ready: boolean;
  notReadyReason: string | null;
}

export interface CompositionInfo {
  id: string;
  width?: number;
  height?: number;
  fps?: number;
  durationSec?: number;
  durationFrames?: number;
  source: 'static' | 'cli';
}

export interface StudioProject {
  id: string;
  name: string;
  kind: StudioKind;
  path: string;
  exists: boolean;
  notes: string;
  docs: { name: string; path: string }[];
  presets: PresetPublic[];
  compositions: CompositionInfo[];
  /** When the on-demand CLI listing last ran (ISO), null if it never did. */
  compositionsCliAt: string | null;
  canListCompositions: boolean;
}

export interface StudioOutput {
  id: string;
  name: string;
  /** Path shown to the user (absolute). */
  path: string;
  rel: string;
  projectId: string;
  media: MediaClass;
  ext: string;
  size: number;
  mtime: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  /** Video frame rate from ffprobe (null for audio / unprobed). */
  fps?: number | null;
  /** iCloud placeholder (size > 0 but no blocks on disk): reading it would trigger a download. */
  offline: boolean;
}

export interface GenerationInput {
  /** `g_<manifest id>`: usable as an ffmpeg file arg. */
  id: string;
  name: string;
  media: MediaClass;
  size: number;
  created: string;
  prompt: string;
}

/** A VANTA VECTOR track as an audio input (`m_<hash>`). iCloud placeholders are listed but cannot be picked. */
export interface MusicInput extends GenerationInput {
  offline: boolean;
  /** `brctl download "<folder>"` for placeholders. */
  brctl: string | null;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled' | 'interrupted';

export interface StudioJob {
  id: string;
  projectId: string;
  projectName: string;
  presetId: string;
  presetLabel: string;
  /** Display values for the args the user chose (file ids replaced by names). */
  args: Record<string, string>;
  command: string;
  status: JobStatus;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  exitCode: number | null;
  signal: string | null;
  error: string | null;
  outputPath: string | null;
  outputId: string | null;
  outputBytes: number | null;
  progress: { pct: number | null; label: string };
  logLines: number;
}

export interface StudioStorage {
  ok: boolean;
  root: string;
  freeBytes: number | null;
  reason: string | null;
}

export interface JobsResponse {
  jobs: StudioJob[];
  storage: StudioStorage;
  /** Id of the job currently executing, if any. */
  runningId: string | null;
}

export interface LogEvent {
  seq: number;
  line: string;
}
