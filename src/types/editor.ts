// Shared (client + server) shapes for the VOLTA Editor: real media bin, per-file feedback, live skill targets.

export type EditorMediaKind = 'video' | 'audio' | 'image';
export type EditorSource = 'studio' | 'generations';
export type EditorSkillTag = '/animate' | '/cut' | 'audio' | '/robo';
export type EditorClipStatus = 'NEEDS REVIEW' | 'CHANGES REQUESTED' | 'APPROVED';
/** Studio project kinds (see config/studio-projects.json), or null for Generations files. */
export type EditorProjectKind = 'remotion' | 'hyperframes' | 'ffmpeg' | 'pipeline' | null;

/** One real file in the media bin. `id` is the fileKey: `o_<16 hex>` (Studio output) or `g_<manifest id>` (Generations). */
export interface EditorMediaItem {
  id: string;
  source: EditorSource;
  /** Studio project id, or "generations". */
  group: string;
  groupName: string;
  projectId: string | null;
  projectKind: EditorProjectKind;
  /** Absolute project folder (for the prompt compiler), when the file belongs to a configured Studio project. */
  projectPath: string | null;
  name: string;
  path: string;
  media: EditorMediaKind;
  ext: string;
  size: number;
  /** ISO. */
  mtime: string;
  durationSec: number | null;
  fps: number | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  /** iCloud placeholder ("dataless"): not on this Mac, cannot be opened until downloaded. */
  offline: boolean;
  /** Range-capable URL that serves the file. */
  url: string;
  /** `brctl download "<path>"` for offline files. */
  brctl: string | null;
  /** True only for files that belong to a project in config/studio-projects.json. */
  canSaveNotes: boolean;
}

export interface EditorMediaGroup {
  id: string;
  name: string;
  kind: EditorProjectKind;
  source: EditorSource;
  path: string | null;
  exists: boolean;
  total: number;
  items: EditorMediaItem[];
}

export interface EditorMediaList {
  groups: EditorMediaGroup[];
  storage: { windsorMounted: boolean; feedbackDir: string };
  errors: string[];
}

/** A pin as persisted: timestamps are LOCAL to the file (seconds from its start). */
export interface EditorPinRecord {
  id: string;
  number: number;
  timestampSec: number;
  xPercent: number;
  yPercent: number;
  region?: { x: number; y: number; w: number; h: number };
  commentText: string;
  skill: EditorSkillTag;
  resolved: boolean;
  scriptLine?: string;
}

/** What the browser sends: which Notion episode a file belongs to, and optionally which part of its outline. */
export interface EditorEpisodeTag {
  /** "ep3" (a key from /api/notion/catalog). */
  key: string;
  /** Outline chapter ("Cold open (full, ~56 s)") or "chapter › beat"; null = no specific part. */
  section: string | null;
}

/** The tag as stored with the pins on Windsor: the server fills in the title and Notion links from the Video Production index. */
export interface EditorEpisodeRef extends EditorEpisodeTag {
  number: number;
  /** "Ep 3 · CAIMEO" */
  title: string;
  outlineId: string | null;
  outlineTitle: string | null;
  outlineUrl: string | null;
  ledgerUrl: string | null;
  taggedAt: string;
}

export interface EditorFeedbackDoc {
  v: 1;
  fileKey: string;
  file: { name: string; path: string; projectId: string | null; projectName: string; media: EditorMediaKind; durationSec: number | null; fps: number | null };
  savedAt: string;
  status: EditorClipStatus;
  pins: EditorPinRecord[];
  /** Notion episode this file is tagged with (absent / null = untagged). */
  episode?: EditorEpisodeRef | null;
}

export interface EditorFeedbackResponse {
  doc: EditorFeedbackDoc | null;
  /** False when the Windsor drive is not mounted (nothing can be read or saved). */
  available: boolean;
  reason: string | null;
}

export interface EditorReviewNoteResponse {
  path: string;
  relPath: string;
  projectId: string;
  projectName: string;
  pinCount: number;
}

export interface LiveSkillRef {
  name: string;
  /** Display path, with ~ for the home folder. */
  path: string;
  why: string;
}
export interface LiveSkillSet {
  cut: LiveSkillRef[];
  animate: LiveSkillRef[];
}
export interface EditorSkillsResponse {
  /** Per project kind ("default" for Generations and unknown kinds): the installed live skills each directive should target. */
  byKind: Record<string, LiveSkillSet>;
  /** Installed skills in ~/.claude/skills that look like /cut or /animate helpers but are not in the table above. */
  related: LiveSkillSet;
  skillsDir: string;
}
