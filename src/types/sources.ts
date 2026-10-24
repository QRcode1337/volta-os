// Real-data contracts for VOLTA OS (served by /api/sources, /api/usage, /api/routines, /api/skills-real,
// /api/notes, /api/brain, /api/mcp, /api/ltm/activity, /api/ltm/today).
import type { LtmAppCount, LtmCaptureSummary } from './ltm';

export type SourceStatus = 'live' | 'idle' | 'offline' | 'stale' | 'not-connected';

/** One row of the home "Memory Sources" panel. */
export interface MemorySource {
  id: 'ltm' | 'honcho' | 'claude-mem' | 'pieces-vault' | 'obsidian' | 'notion' | 'calendar' | 'youtube';
  name: string;
  status: SourceStatus;
  headline: string; // "12,475 captures"
  detail: string; // "last capture 3m ago"
  href?: string; // in-app route or external link
  external?: boolean; // href opens outside the OS (obsidian://, http://localhost:37777, notion.so)
  setupHint?: string; // shown when offline / not connected
  /** Real counts behind the headline (e.g. Honcho workspaces/peers/sessions), for chips or tooltips. */
  metrics?: SourceMetric[];
  /** When the slow part of this row (network/filesystem probes) was last measured (ISO). */
  checkedAt?: string;
}

export interface SourceMetric {
  label: string; // "workspaces", "captures waiting"
  value: number;
  /** Optional qualifier, e.g. "lower bound" or "as of 14:02". */
  note?: string;
}

export interface TokenWindow {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number; // input + output + cacheRead + cacheWrite
  messages: number; // assistant messages
}

/** Claude Code usage parsed from ~/.claude/projects transcripts (local, approximate). */
export interface UsageSummary {
  window5h: TokenWindow;
  window7d: TokenWindow;
  byModel7d: { model: string; total: number; messages: number }[];
  daily14d: { date: string; total: number; messages: number }[];
  sessions7d: number; // the user's own sessions (background observer transcripts excluded)
  /** Part of window7d written by background tools (claude-mem's observer): real plan usage, but not the user's sessions. */
  automated7d?: { sessions: number; total: number; messages: number };
  lastMessageAt: string | null; // ISO, newest message of the user's own sessions (drives `cache`)
  cache: { state: 'WARM' | 'COLD'; idleMinutes: number; minutesLeft: number; ttlMinutes: number };
  scannedFiles: number;
  generatedAt: string;
}

export interface RealRoutine {
  id: string;
  name: string;
  source: 'openclaw' | 'launchd';
  schedule: string; // "every 5h", "cron 0 9 * * 1-5 (America/New_York)", "keep-alive", "every 30m"
  enabled: boolean;
  running: boolean | null; // launchd: has a PID
  pid: number | null;
  agent: string | null; // openclaw agent id
  lastRunAt: string | null; // ISO
  nextRunAt: string | null; // ISO
  /**
   * Where nextRunAt came from: 'scheduler' = OpenClaw's own state, 'plist' = computed by the server from a
   * LaunchAgent's StartCalendarInterval (local time), null = no next run (interval / keep-alive / on demand).
   */
  nextRunSource: 'scheduler' | 'plist' | null;
  lastStatus: 'ok' | 'error' | 'skipped' | null;
  lastError: string | null;
  /** launchd: previous instance's exit status from `launchctl list` (negative = killed by signal); null when it never ran since load, and for non-launchd jobs. */
  exitCode: number | null;
  consecutiveErrors: number;
  /** One server-side verdict for every page (see routines.ts healthOf). */
  health: RoutineHealth;
  /** For the weekly matrix, when derivable: first week-repeating entry. null for yearly/monthly-only jobs. */
  hourOfDay: number | null;
  days: ('M' | 'T' | 'W' | 'TH' | 'F' | 'SA' | 'SU')[]; // empty = every day / interval
  /** How often it fires (launchd: from StartInterval / StartCalendarInterval Month/Day/Weekday keys). */
  cadence?: RoutineCadence;
  /** launchd: newest mtime of the plist's StandardOut/ErrorPath log, i.e. when it last wrote output (not a run record). */
  logUpdatedAt?: string | null;
}

/** 'mixed' = several calendar entries with different cadences; 'cron' = OpenClaw cron expression. */
export type RoutineCadence = 'interval' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'mixed' | 'cron' | 'keep-alive' | 'on-demand';

/**
 * disabled = not enabled/loaded · running = launchd job alive now (a non-zero exitCode belongs to the previous
 * instance) · stopped = keep-alive job last killed by SIGTERM/SIGKILL · failing = last run errored ·
 * skipped / ok = last run result · idle = never ran / no status.
 */
export type RoutineHealth = 'failing' | 'stopped' | 'running' | 'skipped' | 'ok' | 'idle' | 'disabled';

export interface RealSkill {
  id: string; // invocation name, e.g. "graphify" or "superpowers:writing-plans"
  name: string;
  source: 'user' | 'plugin';
  plugin: string | null;
  description: string;
  path: string; // SKILL.md absolute path ('' when not installed)
  /** true = SKILL.md found on disk; false = seen only in transcripts (built-ins, removed plugins, ambiguous names). */
  installed: boolean;
  /**
   * Invocable in Claude Code now: a user skill, or a plugin skill whose plugin is enabled in ~/.claude/settings.json
   * (a disabled plugin's skills stay on disk). false for transcript-only entries.
   */
  enabled?: boolean;
  uses30d: number;
  lastUsedAt: string | null;
}

/** "Live" threshold for the newest LTM capture, shared by the Memory Sources row and the Today widget. */
export const LTM_LIVE_MINUTES = 10;

export interface RecentNote {
  title: string;
  vault: string;
  vaultId: string;
  relPath: string;
  folder: string; // first path segment or "(root)"
  mtime: string; // ISO
  obsidianUrl: string;
}

export interface BrainGraphNode {
  id: string; // `${vaultId}:${relPath}`
  label: string;
  vault: string;
  folder: string;
  relPath: string;
  degree: number;
  mtime: string;
  obsidianUrl: string;
}

export interface BrainGraph {
  nodes: BrainGraphNode[]; // capped (highest degree + most recent)
  edges: { source: string; target: string }[]; // wikilinks between included nodes
  totalNotes: number;
  totalLinks: number;
  skippedFiles: number; // iCloud placeholders or >2 MB notes whose links weren't read
  vaults: { id: string; name: string; notes: number }[];
  folders: { vault: string; folder: string; count: number }[];
  generatedAt: string;
}

export interface McpServerInfo {
  name: string;
  /** user = ~/.claude.json mcpServers · project = ~/.claude.json projects[dir].mcpServers · plugin = an enabled plugin's .mcp.json */
  scope: 'user' | 'plugin' | 'project';
  transport: 'stdio' | 'http' | 'sse' | 'unknown';
  command: string | null; // executable basename only (no args/env — may hold secrets)
  host: string | null; // for http/sse
  /** http/sse: the host answered any HTTP response within 1.5s (checked ≤ 5 min ago); stdio/unknown: null (not checkable without launching). */
  reachable?: boolean | null;
  /** When `reachable` was measured (ISO); null when not checked. */
  checkedAt?: string | null;
  plugin?: string | null; // scope 'plugin': "playwright@claude-plugins-official"
  project?: string | null; // scope 'project': the project directory
}

export interface LtmActivity {
  days: { date: string; total: number; hours: number[] }[]; // newest last, 24 hourly buckets
}

export interface LtmToday {
  date: string;
  count: number;
  firstTs: string | null;
  lastTs: string | null;
  mix: LtmAppCount[]; // top 4 + "Other"
  recent: LtmCaptureSummary[]; // newest first; ?recent=N (1–50, default 5)
}

export interface NotionPage {
  title: string;
  visits: number; // LTM captures with this window title
  url: string | null;
}
