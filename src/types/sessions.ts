// VOLTA Sessions — read-only browser of Claude Code transcripts in ~/.claude/projects.
// Served by /api/claude-sessions, /api/claude-sessions/[id], /api/claude-sessions/[id]/transcript and
// /api/claude-sessions/[id]/memory. Every string in these payloads has secrets masked server-side.

/** input + output + cache read + cache write, summed over assistant messages deduplicated by message id. */
export interface SessionTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

/** The transcript index is built lazily in the background; payloads carry its progress. */
export interface SessionIndexProgress {
  state: 'idle' | 'scanning' | 'ready' | 'error';
  filesTotal: number;
  filesIndexed: number; // files whose current version is parsed
  bytesTotal: number;
  bytesIndexed: number;
  startedAt: string | null; // current / last pass
  finishedAt: string | null;
  lastPassMs: number | null; // wall time of the last completed pass
  error?: string;
}

export interface ClaudeProject {
  id: string; // directory name under ~/.claude/projects
  path: string; // display path ("~/…"): the transcripts' cwd, else the decoded directory name
  pathSource: 'cwd' | 'decoded';
  name: string; // last path segment ("~" for the home directory)
  automated: boolean; // cwd inside ~/.claude* — claude-mem observer, double-shot-latte, plugin runs
  sessions: number;
  subagents: number; // subagent transcript files
  lastActive: string | null; // ISO
  tokens: number; // total tokens (message ids deduplicated across the project)
  activity30d: number[]; // assistant messages per local day, oldest → today (aligned with ClaudeSessionList.days)
}

export interface ToolCount {
  name: string;
  count: number;
  errors: number; // tool results flagged is_error
}

export interface ClaudeSessionSummary {
  id: string;
  projectId: string;
  projectPath: string;
  projectName: string;
  automated: boolean;
  title: string;
  titleSource: 'custom' | 'ai' | 'summary' | 'prompt' | 'command' | 'none';
  firstPrompt: string | null;
  start: string | null; // ISO, earliest event (main + subagents)
  end: string | null; // ISO, latest event
  durationMs: number; // end − start (wall clock, includes idle gaps)
  activeMs: number; // ESTIMATE: union of activity, counting gaps between events of ≤ 10 min
  userPrompts: number; // human/SDK prompts (excludes tool results, meta and slash-command output)
  assistantMessages: number; // unique assistant message ids (main + subagents)
  toolCalls: number;
  toolErrors: number;
  tokens: SessionTokens;
  models: string[];
  topTools: ToolCount[]; // up to 5
  skills: string[]; // Skill tool invocations
  subagents: number;
  gitBranch: string | null;
  version: string | null; // Claude Code version
  entrypoint: string | null; // cli · claude-desktop · sdk-cli · sdk-ts …
  bytes: number; // transcript bytes on disk (main + subagents)
  live: boolean; // a transcript file changed in the last 2 minutes
}

export interface ClaudeSessionList {
  progress: SessionIndexProgress;
  projects: ClaudeProject[];
  sessions: ClaudeSessionSummary[];
  total: number; // sessions matching the filters (before offset/limit)
  offset: number;
  limit: number;
  totals: { sessions: number; projects: number; subagentFiles: number; tokens: number; bytes: number };
  days: string[]; // the 30 local dates (YYYY-MM-DD) activity30d covers
  generatedAt: string;
}

export interface ClaudeSubagent {
  agentId: string;
  agentType: string | null;
  description: string | null;
  workflow: string | null; // workflow run id when spawned by a Workflow script
  start: string | null;
  end: string | null;
  assistantMessages: number;
  toolCalls: number;
  tokens: SessionTokens;
  models: string[];
  firstPrompt: string | null;
  bytes: number;
}

export interface ClaudeSessionDetail extends ClaudeSessionSummary {
  tools: ToolCount[];
  skillCounts: { name: string; count: number }[];
  commands: { name: string; count: number }[]; // slash commands typed in the session
  byModel: { model: string; messages: number; tokens: SessionTokens }[];
  mainTokens: SessionTokens;
  subagentTokens: SessionTokens;
  subagentList: ClaudeSubagent[];
  branches: string[];
  prs: { number: number; url: string; repo: string }[];
  lastPrompt: string | null;
  indexed: boolean; // false while the background index has not reached this session yet
}

export type TranscriptItem =
  | { kind: 'user'; ts: string | null; text: string; truncated: boolean; images: number; source: string | null }
  | { kind: 'assistant'; ts: string | null; model: string | null; text: string; truncated: boolean }
  | { kind: 'thinking'; ts: string | null; text: string; truncated: boolean }
  | {
      kind: 'tool';
      ts: string | null;
      id: string;
      name: string;
      summary: string; // short input summary ("npm test", "src/app/page.tsx", …)
      input: string; // compact JSON, truncated
      inputTruncated: boolean;
      result: string | null; // null until the matching tool_result is seen
      resultChars: number; // original result length
      isError: boolean;
    }
  | { kind: 'meta'; ts: string | null; label: string; text: string };

export interface TranscriptPage {
  sessionId: string;
  agentId: string | null; // null = the main session transcript
  offset: number;
  limit: number;
  total: number;
  items: TranscriptItem[];
  bytes: number; // file size parsed
}

export interface ClaudeMemObservation {
  id: number;
  type: string;
  title: string;
  subtitle: string | null;
  narrative: string | null;
  facts: string[];
  filesModified: string[];
  promptNumber: number | null;
  createdAt: string | null;
}

export interface ClaudeMemSummary {
  id: number;
  request: string | null;
  investigated: string | null;
  learned: string | null;
  completed: string | null;
  nextSteps: string | null;
  createdAt: string | null;
}

export interface SessionMemory {
  online: boolean;
  url: string;
  observations: ClaudeMemObservation[];
  hasMore: boolean;
  summaries: ClaudeMemSummary[];
  error?: string;
}
