// Shared (client + server) shapes for VOLTA Music. No runtime imports so both sides can use it.

export type TrackStorage = 'local' | 'icloud';

export interface TrackMeta {
  /** Display title override (the filename-derived title is used when empty). */
  title?: string;
  lyrics?: string;
  /** Who made it: "Patrick", "Suno", "Seraphim of the Void", ... */
  credits?: string[];
  sunoUrl?: string;
  /** Mood / genre tags. */
  tags?: string[];
  bpm?: number | null;
  key?: string;
  notes?: string;
  updatedAt?: string;
}

export interface EmbeddedTags {
  title?: string;
  artist?: string;
  album?: string;
  track?: string;
  date?: string;
  genre?: string;
  comment?: string;
}

export interface MusicTrack {
  /** m_ + 16 hex. Stable across restarts (hash of root id + relative path). Doubles as the Studio file id. */
  id: string;
  rootId: string;
  /** Path relative to its root. */
  rel: string;
  /** Absolute path on disk. */
  path: string;
  /** Folder that holds the file (what `brctl download` is pointed at). */
  folder: string;
  fileName: string;
  title: string;
  format: string;
  mime: string;
  bytes: number;
  mtime: string;
  storage: TrackStorage;
  /** Only for local files (ffprobe). */
  durationSec: number | null;
  bitrateKbps: number | null;
  sampleRate: number | null;
  channels: number | null;
  codec: string | null;
  tags: EmbeddedTags;
  hasCover: boolean;
  meta: TrackMeta;
}

export interface MusicRoot {
  id: string;
  label: string;
  path: string;
  enabled: boolean;
  exists: boolean;
  trackCount: number;
  localCount: number;
  icloudCount: number;
  /** `brctl download "<folder>"` (shown when this root has placeholders). */
  downloadCommand: string;
}

export interface RootCandidate {
  path: string;
  label: string;
  /** Audio files directly inside the folder. */
  audioFiles: number;
  depth: number;
}

export interface MusicLibrary {
  band: string;
  tracks: MusicTrack[];
  roots: MusicRoot[];
  candidates: RootCandidate[];
  meta: { path: string; ok: boolean; reason: string | null };
  counts: { total: number; local: number; icloud: number };
  generatedAt: string;
  /** Problems reading config/music.json (empty when fine). */
  configErrors: string[];
}
