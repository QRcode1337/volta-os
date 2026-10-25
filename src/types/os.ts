// VOLTA Agentic OS — shared contracts. Owned by Phase 0 (lead). Sub-agents import, never edit.
// Need an extra type? Declare it locally in your own files.

export type ModelTier = 'HAIKU' | 'SONNET' | 'OPUS' | 'FABLE';
export type EffortLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH' | 'MAX';
export type Department =
  | 'skills'
  | 'business'
  | 'content'
  | 'personal'
  | 'product'
  | 'community'
  | 'routines'
  | 'applications'
  | 'memory';

export interface MicroAppItem {
  id: string;
  name: string;
  subtitle: string;
  route: string;
  port: number;
  iconType: 'ltm' | 'honcho' | 'research' | 'tasks' | 'feeds' | 'launchpad' | 'music' | 'systems' | 'sessions' | 'search' | 'editor' | 'scripts' | 'generations' | 'studio' | 'recos' | 'brain' | 'excalidraw' | 'elements' | 'carousels';
  accentColor: string;
  /** True for tool apps that still run on sample content rather than the user's real data. */
  sample?: boolean;
}

export interface ArtifactItem {
  id: string;
  title: string;
  clientOrTag: string;
  type: 'deck' | 'pdf' | 'html' | 'image' | 'doc';
  filePath: string;
  createdAt: string; // e.g., "2 days ago"
  angleDeg: number; // 0 to 360 for radial ring placement
}

export interface CalendarEvent {
  id: string;
  title: string;
  timeRange: string;
  relativeTime: string;
}

export interface EmailFlaggedItem {
  id: string;
  sender: string;
  subject: string;
  age: string; // e.g. "2h", "5h", "7h"
  category: 'PARTNERS' | 'LEADS' | 'PERSONAL' | 'OTHER';
  completed: boolean;
}

export interface RoutineItem {
  id: string;
  time: string; // e.g. "10:00"
  name: string;
  runner: 'DESKTOP' | 'HERMES';
  status: 'NEXT' | 'QUEUED' | 'DONE';
  mode: 'ACTIVE' | 'PASSIVE';
  tokensPerWeek: number; // e.g. 18200000
  costPerWeekUsd: number; // e.g. 9.44
  capUsd?: number;
  scheduleDays: ('M' | 'T' | 'W' | 'TH' | 'F' | 'SA' | 'SU')[];
  hourOfDay: number; // 0-23
}

export interface SkillCardItem {
  id: string;
  command: string; // e.g. "/clean-up"
  name: string;
  category: 'database' | 'artifact' | 'self-triggered';
  model: ModelTier;
  effort: EffortLevel;
  tokensPerWeek: number;
  costPerWeekUsd: number;
  usesPerWeek: number;
  filePath: string;
  markdownContent: string;
}

export interface BrainNode {
  id: string;
  label: string;
  department: Department;
  filePath: string;
  tokens: number;
  lastEdited: string; // ISO date
  connections: string[]; // target node IDs
  summary?: string;
  content?: string;
}

export interface VideoPinComment {
  id: string;
  clipId: string;
  timestampSec: number;
  formattedTime: string; // e.g. "00:14:21"
  xPercent: number; // 0-100 spatial pin on video canvas
  yPercent: number; // 0-100
  commentText: string;
}

// ───────────────────────── Integration types (Phase 0 additions) ─────────────────────────

export interface VideoClip {
  id: string; // "clip-01"
  number: number; // 1..8
  title: string;
  kind: 'ANIMATION' | 'A-ROLL CUT';
  status: 'NEEDS REVIEW' | 'CHANGES REQUESTED' | 'APPROVED';
  startSec: number; // position on the master timeline
  durationSec: number;
  sourcePath: string; // e.g. "workspace/videos/clips/02-home-os.tsx"
  sceneKey: string; // procedural scene id the editor renders when no video file is attached
  animationLabel: string; // block label on the ANIMATIONS track
  voiceover: { atSec: number; text: string }[]; // relative to clip start
}

export interface ConnectorItem {
  id: string;
  name: string;
  tier: 'CLI' | 'API' | 'MCP';
  description: string;
  contextTokens: number; // tokens preloaded at session start (0 for CLI)
  enabled: boolean;
  usesPerWeek: number;
}

export interface YouTubeVideoStat {
  id: string;
  title: string;
  views48h: number;
  publishedAgo: string;
}

export interface UsageSnapshot {
  weeklyPctLeft: number; // 68
  fiveHourPctLeft: number; // 84
  cache: {
    state: 'WARM' | 'COLD';
    warmMinutesLeft: number;
    cachedTokens: number;
    idleLabel: string;
    coldTokens: number;
    contextUsed: number;
    contextMax: number;
    warmNextMsgUsd: number;
    coldReloadUsd: number;
  };
  jev: { routes: number; totalUsd: number; haikuPct: number };
}

// ── API contracts ──

export interface SkillRunRequest {
  command: string; // "/clean-up"
  model: ModelTier;
  effort: EffortLevel;
  customPrompt?: string;
}

export interface SkillRunResult {
  ok: boolean;
  command: string;
  mode: 'live' | 'mock'; // live = real `claude -p` ran
  requestedModel: ModelTier;
  routedModel: ModelTier; // what Jev decided
  effort: EffortLevel;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  markdown: string; // report body
  error?: string;
}

export interface JevRouteRequest {
  prompt: string;
  command?: string;
}

export interface JevRouteResult {
  model: Exclude<ModelTier, 'FABLE'>;
  confidence: number; // 0-1
  latencySec: number; // ~0.006
  costUsd: number; // ~0.00004
  reason: string;
  telemetry: { calls: number; totalUsd: number; haikuPct: number; sonnetPct: number; opusPct: number };
}

export interface WorkspaceResponse {
  totalFiles: number; // 424846
  scannedFiles: number; // real files found under ./workspace
  nodes: BrainNode[];
  edges: { source: string; target: string }[];
  skills: SkillCardItem[];
  routines: RoutineItem[];
  artifacts: ArtifactItem[];
}

export interface WorkspaceFileResponse {
  path: string; // workspace-relative
  content: string;
  exists: boolean;
}

/** Cross-app hand-off into VOLTA Editor's clip bin (see src/lib/editor-inbox.ts). */
export interface EditorInboxItem {
  id: string;
  title: string;
  kind: 'ANIMATION' | 'A-ROLL CUT';
  durationSec: number;
  source: 'generations' | 'scripts' | 'carousels' | 'studio' | 'music';
  sceneKey?: string;
  /** Notion page the cues were built from (Scripts). */
  notion?: { title: string; url: string };
  cues?: { atSec: number; voiceover: string; visualCue: string }[];
  createdAt: string; // ISO
  /** Real file (Generations / Studio / Music): absolute path on disk and the /api/{media,studio,music}/file URL that serves it. */
  file?: string;
  mediaUrl?: string;
}
