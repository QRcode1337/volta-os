import 'server-only';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { redactSecrets } from '@/app/api/honcho/_shared';
import type {
  ClaudeMemObservation,
  ClaudeMemSummary,
  ClaudeProject,
  ClaudeSessionDetail,
  ClaudeSessionList,
  ClaudeSessionSummary,
  ClaudeSubagent,
  SessionIndexProgress,
  SessionMemory,
  SessionTokens,
  ToolCount,
  TranscriptItem,
  TranscriptPage,
} from '@/types/sessions';
import { CLAUDE_MEM_URL } from './claude-mem';

// VOLTA Sessions — a read-only index of Claude Code transcripts (~/.claude/projects/<project>/<session>.jsonl,
// plus <session>/subagents/[workflows/<wf>/]agent-*.jsonl).
//
// Cost model (≈1,600 files / 800+ MB on this machine): the index is built lazily, in the background, newest files
// first, one file at a time. Each file keeps a byte offset, so an append-only transcript only has its new tail
// parsed; a file that shrank or was rewritten is re-read. Lines are classified by a cheap byte prefix check before
// any JSON.parse: attachment / api-request / snapshot records (≈60% of the bytes) are skipped outright, and large
// tool-result lines are read with indexOf instead of being parsed. Requests never wait for a full pass — they get
// whatever is indexed so far plus progress. Transcript pages for the detail view are parsed on demand per file and
// kept in a 3-entry LRU (truncated items only). Nothing is ever written.

const HOME = os.homedir();
export const PROJECTS_DIR = path.join(HOME, '.claude', 'projects');
const NEWLINE = 0x0a;
const HEAD_BYTES = 700; // enough to see the top-level "type" of user records and the role of assistant ones
const PARSE_TOOL_RESULT_MAX = 64 * 1024; // bigger tool-result lines are read with indexOf, never parsed (index mode)
const ACTIVE_GAP_MS = 10 * 60_000; // gaps longer than this do not count toward the activeMs estimate
const REFRESH_MS = 30_000; // re-stat the tree at most this often
const LIVE_MS = 2 * 60_000;
const FIRST_WAIT_MS = 1_500; // the very first request waits this long for the newest files
const STAT_BATCH = 64;
const MAX_PROMPTS = 4; // prompt samples kept per file for search
const PROMPT_CHARS = 280;
const TITLE_CHARS = 160;

// Transcript (detail) limits — items are truncated so a cached transcript stays small.
const TEXT_MAX = 12_000;
const THINKING_MAX = 4_000;
const TOOL_INPUT_MAX = 1_500;
const TOOL_RESULT_MAX = 2_400;
const META_MAX = 700;
const TRANSCRIPT_LRU = 3;

// ───────────────────────── Secret masking ─────────────────────────
// redactSecrets (shared with the Honcho proxy) handles vendor key prefixes, `name=value` secrets, Bearer tokens,
// PEM blocks and random-looking 32+ char runs. Transcripts additionally carry shell commands and HTTP calls, so
// Authorization headers, *_KEY / *_TOKEN env assignments, --password style flags and URL credentials are masked too.

const MASK = '••••';
function maskToken(t: string): string {
  const keep = t.length >= 24 ? 6 : t.length >= 16 ? 3 : 0;
  return `${t.slice(0, keep)}${MASK}(${t.length})`;
}
const AUTH_HEADER_RE = /(\bauthorization["']?\s*[:=]\s*["']?)(?:(basic|bearer|token|digest|apikey)\s+)?([A-Za-z0-9._~+/=:-]{8,})/gi;
const ENV_SECRET_RE =
  /\b([A-Z][A-Z0-9_]*(?:_KEY|_KEYS|_TOKEN|_SECRET|_PASS|_PASSWORD|_PWD|_AUTH|_CREDENTIALS?|KEY_[A-Z0-9]{1,4}))(\s*[=:]\s*["']?)([^\s"'`,;)]{8,})/g;
const FLAG_SECRET_RE = /(--(?:password|passwd|pass|token|api[-_]?key|secret|auth[-_]token|access[-_]token|client[-_]secret)(?:=|\s+)["']?)([^\s"'`]{6,})/gi;
const URL_CRED_RE = /(\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s:@/"'`]{1,64}:)([^\s@/"'`]{3,})(@)/gi;

export function maskSecrets(text: string): string {
  if (!text || text.length < 8) return text;
  const out = text
    .replace(AUTH_HEADER_RE, (m, pre: string, scheme: string | undefined, tok: string) =>
      tok.includes(MASK) || tok.startsWith('$') ? m : `${pre}${scheme ? `${scheme} ` : ''}${maskToken(tok)}`,
    )
    .replace(ENV_SECRET_RE, (m, name: string, sep: string, value: string) =>
      value.includes(MASK) || value.startsWith('$') || /^[a-z]+$/i.test(value) ? m : `${name}${sep}${maskToken(value)}`,
    )
    .replace(FLAG_SECRET_RE, (m, pre: string, value: string) => (value.includes(MASK) || value.startsWith('$') ? m : `${pre}${maskToken(value)}`))
    .replace(URL_CRED_RE, (m, pre: string, pass: string, at: string) => (pass.includes(MASK) ? m : `${pre}${maskToken(pass)}${at}`));
  return redactSecrets(out);
}

/** Keys whose values are identifiers used for navigation (never masked). */
const ID_KEYS = new Set(['id', 'sessionId', 'projectId', 'agentId', 'workflow']);

/** Mask every string in a JSON-able payload (ids excepted). */
export function maskDeep<T>(v: T, key?: string): T {
  if (typeof v === 'string') return (key && ID_KEYS.has(key) ? v : maskSecrets(v)) as T;
  if (Array.isArray(v)) return v.map((x) => maskDeep(x, key)) as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = maskDeep(x, k);
    return out as T;
  }
  return v;
}

// ───────────────────────── Paths ─────────────────────────

interface FileRef {
  file: string;
  projectId: string;
  sessionId: string;
  agentId: string | null; // null = main transcript
  workflow: string | null;
}

/** <project>/<session>.jsonl, <project>/<session>/subagents/agent-x.jsonl, …/subagents/workflows/<wf>/agent-x.jsonl */
function refOf(file: string): FileRef | null {
  const parts = path.relative(PROJECTS_DIR, file).split(path.sep);
  if (parts.some((p) => p === '..' || p === '')) return null;
  const base = (name: string) => name.replace(/\.jsonl$/, '');
  const agent = (name: string) => base(name).replace(/^agent-/, '');
  const last = parts[parts.length - 1];
  if (parts.length === 2) return { file, projectId: parts[0], sessionId: base(last), agentId: null, workflow: null };
  // Workflow dirs also hold journal.jsonl (run log, not a transcript): only agent-*.jsonl are subagent transcripts.
  if (!isAgentFile(last)) return null;
  if (parts.length === 4 && parts[2] === 'subagents')
    return { file, projectId: parts[0], sessionId: parts[1], agentId: agent(last), workflow: null };
  if (parts.length === 6 && parts[2] === 'subagents' && parts[3] === 'workflows')
    return { file, projectId: parts[0], sessionId: parts[1], agentId: agent(last), workflow: parts[4] };
  return null;
}

async function readdirSafe(dir: string): Promise<fs.Dirent[]> {
  try {
    return await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

const isAgentFile = (name: string) => name.startsWith('agent-') && name.endsWith('.jsonl');

async function listSessionDir(dir: string, out: string[]) {
  const subDir = path.join(dir, 'subagents');
  for (const e of await readdirSafe(subDir)) {
    const p = path.join(subDir, e.name);
    if (e.isFile() && isAgentFile(e.name)) out.push(p);
    else if (e.isDirectory() && e.name === 'workflows') {
      for (const wf of await readdirSafe(p)) {
        if (!wf.isDirectory()) continue;
        for (const f of await readdirSafe(path.join(p, wf.name))) {
          if (f.isFile() && isAgentFile(f.name)) out.push(path.join(p, wf.name, f.name));
        }
      }
    }
  }
}

async function listFiles(): Promise<string[]> {
  const out: string[] = [];
  for (const proj of await readdirSafe(PROJECTS_DIR)) {
    if (!proj.isDirectory()) continue;
    const pdir = path.join(PROJECTS_DIR, proj.name);
    const entries = await readdirSafe(pdir);
    const sessionDirs: string[] = [];
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.jsonl')) out.push(path.join(pdir, e.name));
      else if (e.isDirectory() && !e.name.startsWith('.')) sessionDirs.push(path.join(pdir, e.name));
    }
    for (const d of sessionDirs) await listSessionDir(d, out);
  }
  return out;
}

const encodeCwd = (p: string) => p.replace(/[^A-Za-z0-9]/g, '-');
const AUTOMATED_PREFIXES = [path.join(HOME, '.claude') + path.sep, path.join(HOME, '.claude-mem') + path.sep];
const isAutomatedPath = (p: string) => AUTOMATED_PREFIXES.some((pre) => (p + path.sep).startsWith(pre));
/** Directory-name test used before any cwd is known (index priority only). */
const AUTOMATED_DIR_PREFIX = encodeCwd(path.join(HOME, '.claude'));
const isAutomatedDir = (projectId: string) => projectId.startsWith(AUTOMATED_DIR_PREFIX);

export function displayPath(p: string): string {
  if (p === HOME) return '~';
  return p.startsWith(HOME + path.sep) ? `~${p.slice(HOME.length)}` : p;
}

/** Lossy fallback for a project without any cwd: "-Users-me-foo--bar" → "/Users/me/foo/.bar". */
function decodeProjectDir(id: string): string {
  return id.replace(/--/g, '/.').replace(/-/g, '/');
}

// ───────────────────────── Per-file scan state ─────────────────────────

interface UsageRec {
  model: string;
  i: number;
  o: number;
  cr: number;
  cw: number;
}

interface FileScan extends FileRef {
  mtimeMs: number;
  size: number;
  offset: number; // bytes parsed: end of the last complete line
  firstTs: number; // epoch ms, 0 = none
  lastTs: number;
  spans: number[]; // flattened [start, end, …] activity spans (gaps ≤ ACTIVE_GAP_MS merged)
  cwd: string | null;
  gitBranch: string | null;
  branches: string[];
  version: string | null;
  entrypoint: string | null;
  customTitle: string | null;
  aiTitle: string | null;
  summary: string | null;
  agentName: string | null;
  firstPrompt: string | null;
  prompts: string[];
  lastPrompt: string | null;
  firstCommand: string | null;
  userPrompts: number;
  toolResults: number;
  usage: Map<string, UsageRec>; // assistant message id → usage (streamed copies keep the largest output)
  tools: Map<string, [count: number, errors: number]>;
  pendingTools: Map<string, string>; // tool_use id → name until its result arrives
  skills: Map<string, number>;
  commands: Map<string, number>;
  days: Map<string, number>; // local date → new assistant messages
  prs: { number: number; url: string; repo: string }[];
  agentType: string | null; // subagent .meta.json
  description: string | null;
}

function emptyScan(ref: FileRef): FileScan {
  return {
    ...ref,
    mtimeMs: 0,
    size: 0,
    offset: 0,
    firstTs: 0,
    lastTs: 0,
    spans: [],
    cwd: null,
    gitBranch: null,
    branches: [],
    version: null,
    entrypoint: null,
    customTitle: null,
    aiTitle: null,
    summary: null,
    agentName: null,
    firstPrompt: null,
    prompts: [],
    lastPrompt: null,
    firstCommand: null,
    userPrompts: 0,
    toolResults: 0,
    usage: new Map(),
    tools: new Map(),
    pendingTools: new Map(),
    skills: new Map(),
    commands: new Map(),
    days: new Map(),
    prs: [],
    agentType: null,
    description: null,
  };
}

/** Copy for an incremental (append) parse, so a failed parse never leaves half-applied counts behind. */
function cloneScan(s: FileScan): FileScan {
  return {
    ...s,
    spans: [...s.spans],
    branches: [...s.branches],
    prompts: [...s.prompts],
    usage: new Map(s.usage),
    tools: new Map([...s.tools].map(([k, v]) => [k, [v[0], v[1]]] as [string, [number, number]])),
    pendingTools: new Map(s.pendingTools),
    skills: new Map(s.skills),
    commands: new Map(s.commands),
    days: new Map(s.days),
    prs: [...s.prs],
  };
}

const MODEL_INTERN = new Map<string, string>();
const intern = (m: string) => {
  let v = MODEL_INTERN.get(m);
  if (!v) MODEL_INTERN.set(m, (v = m));
  return v;
};

function localDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function touch(s: FileScan, ts: number) {
  if (!Number.isFinite(ts) || ts <= 0) return;
  if (!s.firstTs || ts < s.firstTs) s.firstTs = ts;
  if (ts > s.lastTs) s.lastTs = ts;
  const n = s.spans.length;
  if (n && ts >= s.spans[n - 2] - ACTIVE_GAP_MS && ts <= s.spans[n - 1] + ACTIVE_GAP_MS) {
    if (ts > s.spans[n - 1]) s.spans[n - 1] = ts;
    if (ts < s.spans[n - 2]) s.spans[n - 2] = ts;
  } else s.spans.push(ts, ts);
}

function noteContext(s: FileScan, rec: Rec) {
  if (!s.cwd && typeof rec.cwd === 'string' && rec.cwd) s.cwd = rec.cwd;
  if (typeof rec.gitBranch === 'string' && rec.gitBranch) {
    if (!s.gitBranch) s.gitBranch = rec.gitBranch;
    if (!s.branches.includes(rec.gitBranch) && s.branches.length < 8) s.branches.push(rec.gitBranch);
  }
  if (typeof rec.version === 'string' && rec.version) s.version = rec.version; // latest wins (resumed after updates)
  if (!s.entrypoint && typeof rec.entrypoint === 'string') s.entrypoint = rec.entrypoint;
}

// ───────────────────────── Line classification ─────────────────────────

interface Block {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}
interface Rec {
  type?: string;
  subtype?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  entrypoint?: string;
  isMeta?: boolean;
  isCompactSummary?: boolean;
  promptSource?: string;
  content?: unknown;
  message?: {
    id?: string;
    model?: string;
    role?: string;
    content?: string | Block[];
    usage?: Record<string, number>;
  };
  // metadata records
  customTitle?: string;
  aiTitle?: string;
  summary?: string;
  agentName?: string;
  lastPrompt?: string;
  prNumber?: number;
  prUrl?: string;
  prRepository?: string;
}

type LineKind = 'meta' | 'user' | 'tool-result' | 'assistant' | 'system' | 'skip';
const META_TYPES = new Set(['custom-title', 'ai-title', 'summary', 'agent-name', 'last-prompt', 'pr-link']);
const TOOL_RESULT_HEAD_RE = /"content":\[\{"(?:tool_use_id|type":"tool_result)/;

function classify(buf: Buffer): { kind: LineKind; head: string; metaType?: string } {
  const head = buf.toString('latin1', 0, Math.min(buf.length, HEAD_BYTES));
  if (head.startsWith('{"type":"')) {
    const t = head.slice(9, head.indexOf('"', 9));
    return META_TYPES.has(t) ? { kind: 'meta', head, metaType: t } : { kind: 'skip', head };
  }
  const userAt = head.indexOf('"type":"user"');
  const attAt = head.indexOf('"attachment":');
  if (attAt >= 0 && (userAt < 0 || attAt < userAt)) return { kind: 'skip', head };
  if (userAt >= 0) return { kind: TOOL_RESULT_HEAD_RE.test(head) ? 'tool-result' : 'user', head };
  if (head.includes('"type":"progress"')) return { kind: 'skip', head }; // older hook/agent progress records
  if (head.includes('"role":"assistant"')) return { kind: 'assistant', head };
  if (head.includes('"type":"system"')) return { kind: 'system', head };
  return { kind: 'skip', head };
}

const TS_NEEDLE = Buffer.from('"timestamp":"');
/** First top-level-looking "timestamp" (strings inside JSON values have their quotes escaped, so they can't match). */
function timestampOf(buf: Buffer): number {
  const i = buf.indexOf(TS_NEEDLE);
  if (i < 0) return NaN;
  const start = i + TS_NEEDLE.length;
  const end = buf.indexOf(0x22, start);
  if (end < 0 || end - start > 40) return NaN;
  return Date.parse(buf.toString('latin1', start, end));
}

function parse(buf: Buffer): Rec | null {
  try {
    return JSON.parse(buf.toString('utf8')) as Rec;
  } catch {
    return null;
  }
}

const SYSTEM_REMINDER_RE = /<system-reminder>[\s\S]*?(?:<\/system-reminder>|$)/g;
const COMMAND_NAME_RE = /<command-name>\s*([^<]*?)\s*<\/command-name>/;
const COMMAND_ARGS_RE = /<command-args>([\s\S]*?)<\/command-args>/;

type PromptClass =
  | { kind: 'prompt'; text: string }
  | { kind: 'command'; name: string; args: string }
  | { kind: 'meta'; label: string; text: string }
  | { kind: 'empty' };

/** What a user text block is: a real prompt, a slash command, or harness noise. */
function classifyUserText(raw: string): PromptClass {
  const t = raw.trimStart();
  const cmd = COMMAND_NAME_RE.exec(t);
  if (cmd && (t.startsWith('<command-') || t.startsWith('<command-message>'))) {
    const args = COMMAND_ARGS_RE.exec(t)?.[1]?.trim() ?? '';
    return { kind: 'command', name: cmd[1].startsWith('/') ? cmd[1] : `/${cmd[1]}`, args };
  }
  if (t.startsWith('<local-command-stdout>') || t.startsWith('<local-command-stderr>'))
    return { kind: 'meta', label: 'command output', text: t.replace(/<\/?local-command-std(?:out|err)>/g, '').trim() };
  if (t.startsWith('<local-command-caveat>') || t.startsWith('Caveat: The messages below were generated')) return { kind: 'empty' };
  if (t.startsWith('<task-notification>')) return { kind: 'meta', label: 'task notification', text: t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() };
  if (t.startsWith('<bash-input>')) return { kind: 'meta', label: 'shell', text: `! ${t.replace(/<\/?bash-input>/g, '').trim()}` };
  if (t.startsWith('<bash-stdout>') || t.startsWith('<bash-stderr>'))
    return { kind: 'meta', label: 'shell output', text: t.replace(/<\/?bash-std(?:out|err)>/g, '').trim() };
  if (t.startsWith('[Request interrupted')) return { kind: 'meta', label: 'interrupted', text: t.trim() };
  const clean = t.replace(SYSTEM_REMINDER_RE, '').trim();
  if (!clean) return { kind: 'empty' };
  return { kind: 'prompt', text: clean };
}

const oneLine = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

function bump<K>(m: Map<K, number>, k: K, by = 1) {
  m.set(k, (m.get(k) ?? 0) + by);
}

// ───────────────────────── Index-mode line handlers ─────────────────────────

const IS_ERROR_NEEDLE = Buffer.from('"is_error":true');
const TOOL_USE_ID_RE = /"tool_use_id":"([^"]{1,80})"/;

function noteToolResult(s: FileScan, id: string | undefined, isError: boolean) {
  s.toolResults += 1;
  if (!id) return;
  const name = s.pendingTools.get(id);
  if (name === undefined) return;
  s.pendingTools.delete(id);
  if (isError) {
    const t = s.tools.get(name);
    if (t) t[1] += 1;
  }
}

function indexLine(buf: Buffer, s: FileScan) {
  if (buf.length < 16) return;
  const { kind, head, metaType } = classify(buf);
  if (kind === 'skip') return;
  if (kind === 'system') {
    touch(s, timestampOf(buf));
    return;
  }
  if (kind === 'tool-result' && buf.length > PARSE_TOOL_RESULT_MAX) {
    touch(s, timestampOf(buf));
    noteToolResult(s, TOOL_USE_ID_RE.exec(head)?.[1], buf.indexOf(IS_ERROR_NEEDLE) >= 0);
    return;
  }
  const rec = parse(buf);
  if (!rec) return;
  if (kind === 'meta') {
    switch (metaType) {
      case 'custom-title':
        if (rec.customTitle) s.customTitle = rec.customTitle;
        break;
      case 'ai-title':
        if (rec.aiTitle) s.aiTitle = rec.aiTitle;
        break;
      case 'summary':
        if (rec.summary) s.summary = rec.summary;
        break;
      case 'agent-name':
        if (rec.agentName) s.agentName = rec.agentName;
        break;
      case 'last-prompt':
        if (rec.lastPrompt) s.lastPrompt = oneLine(rec.lastPrompt, PROMPT_CHARS);
        break;
      case 'pr-link':
        if (rec.prUrl && !s.prs.some((p) => p.url === rec.prUrl))
          s.prs.push({ number: Number(rec.prNumber) || 0, url: rec.prUrl, repo: rec.prRepository ?? '' });
        break;
    }
    return;
  }
  const ts = rec.timestamp ? Date.parse(rec.timestamp) : NaN;
  touch(s, ts);
  noteContext(s, rec);
  const m = rec.message;
  if (!m) return;

  if (kind === 'user' || kind === 'tool-result') {
    if (rec.isCompactSummary) return;
    let prompt: string | null = null;
    const texts: string[] = [];
    if (typeof m.content === 'string') texts.push(m.content);
    else if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b?.type === 'tool_result') noteToolResult(s, b.tool_use_id, b.is_error === true);
        else if (b?.type === 'text' && typeof b.text === 'string') texts.push(b.text);
      }
    }
    for (const t of texts) {
      const c = classifyUserText(t);
      // Slash commands count even when the harness marks the record isMeta; injected meta text is never a prompt.
      if (c.kind === 'prompt' && !rec.isMeta) prompt = prompt ? `${prompt}\n${c.text}` : c.text;
      else if (c.kind === 'command') {
        bump(s.commands, c.name);
        if (!s.firstCommand) s.firstCommand = oneLine(`${c.name} ${c.args}`, TITLE_CHARS);
      }
    }
    if (prompt) {
      s.userPrompts += 1;
      if (!s.firstPrompt) s.firstPrompt = oneLine(prompt, PROMPT_CHARS);
      if (s.prompts.length < MAX_PROMPTS) s.prompts.push(oneLine(prompt, PROMPT_CHARS));
    }
    return;
  }

  // assistant
  if (!m.model || m.model === '<synthetic>') return;
  if (m.id && m.usage) {
    const u = m.usage;
    const rec2: UsageRec = {
      model: intern(m.model),
      i: u.input_tokens ?? 0,
      o: u.output_tokens ?? 0,
      cr: u.cache_read_input_tokens ?? 0,
      cw: u.cache_creation_input_tokens ?? 0,
    };
    const prev = s.usage.get(m.id);
    if (!prev) {
      s.usage.set(m.id, rec2);
      if (Number.isFinite(ts)) bump(s.days, localDate(ts));
    } else if (rec2.o >= prev.o) s.usage.set(m.id, rec2);
  }
  if (Array.isArray(m.content)) {
    for (const b of m.content) {
      if (b?.type !== 'tool_use' || typeof b.name !== 'string') continue;
      const t = s.tools.get(b.name);
      if (t) t[0] += 1;
      else s.tools.set(b.name, [1, 0]);
      if (b.id) s.pendingTools.set(b.id, b.name);
      if (b.name === 'Skill' && typeof b.input?.skill === 'string') bump(s.skills, b.input.skill);
    }
  }
}

/** Stream complete lines of [start, end) to `onLine`; returns the offset just past the last newline. */
async function readLines(file: string, start: number, end: number, onLine: (buf: Buffer) => void): Promise<number> {
  if (end <= start) return start;
  let pos = start;
  let parts: Buffer[] = [];
  let pending = 0;
  const stream = fs.createReadStream(file, { start, end: end - 1, highWaterMark: 256 * 1024 });
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    let i = 0;
    while (i < chunk.length) {
      const nl = chunk.indexOf(NEWLINE, i);
      if (nl === -1) {
        parts.push(chunk.subarray(i));
        pending += chunk.length - i;
        break;
      }
      const piece = chunk.subarray(i, nl);
      const line = pending ? Buffer.concat([...parts, piece]) : piece;
      pos += pending + piece.length + 1;
      parts = [];
      pending = 0;
      onLine(line);
      i = nl + 1;
    }
  }
  // An unterminated last line stays unparsed (offset before it); it is read once its newline lands.
  return pos;
}

async function readMeta(file: string): Promise<{ agentType: string | null; description: string | null }> {
  try {
    const raw = await fsp.readFile(file.replace(/\.jsonl$/, '.meta.json'), 'utf8');
    if (raw.length > 64_000) return { agentType: null, description: null };
    const j = JSON.parse(raw) as { agentType?: unknown; description?: unknown };
    return {
      agentType: typeof j.agentType === 'string' ? j.agentType : null,
      description: typeof j.description === 'string' ? oneLine(j.description, TITLE_CHARS) : null,
    };
  } catch {
    return { agentType: null, description: null };
  }
}

async function scanFile(ref: FileRef, st: fs.Stats, prev: FileScan | undefined): Promise<FileScan> {
  // Append-only growth → parse just the tail. Same size with a new mtime, or a shrink → full re-read.
  const resume = prev && st.size > prev.size && prev.offset <= st.size;
  const s = resume ? cloneScan(prev) : emptyScan(ref);
  s.offset = await readLines(ref.file, resume ? prev.offset : 0, st.size, (line) => indexLine(line, s));
  s.mtimeMs = st.mtimeMs;
  s.size = st.size;
  if (ref.agentId && (!resume || (!s.agentType && !s.description))) Object.assign(s, await readMeta(ref.file));
  return s;
}

// ───────────────────────── Global index state (survives HMR) ─────────────────────────

interface IndexState {
  files: Map<string, FileScan>;
  pass: Promise<void> | null;
  lastPassEnd: number;
  version: number;
  progress: SessionIndexProgress;
  agg: { version: number; value: Aggregate } | null;
  transcripts: Map<string, TranscriptCache>;
  memory: Map<string, { at: number; value: SessionMemory }>;
}

const G = globalThis as unknown as { __voltaSessionsV1?: unknown; __voltaSessionsV2?: IndexState };
delete G.__voltaSessionsV1; // older shape (counted workflow journal.jsonl files as subagents); survives HMR otherwise
const S: IndexState = (G.__voltaSessionsV2 ??= {
  files: new Map(),
  pass: null,
  lastPassEnd: 0,
  version: 0,
  progress: {
    state: 'idle',
    filesTotal: 0,
    filesIndexed: 0,
    bytesTotal: 0,
    bytesIndexed: 0,
    startedAt: null,
    finishedAt: null,
    lastPassMs: null,
  },
  agg: null,
  transcripts: new Map(),
  memory: new Map(),
});

const yieldLoop = () => new Promise<void>((r) => setImmediate(r));

async function statAll(files: string[]): Promise<{ ref: FileRef; st: fs.Stats }[]> {
  const out: { ref: FileRef; st: fs.Stats }[] = [];
  for (let i = 0; i < files.length; i += STAT_BATCH) {
    const batch = files.slice(i, i + STAT_BATCH);
    const stats = await Promise.all(batch.map((f) => fsp.stat(f).catch(() => null)));
    stats.forEach((st, j) => {
      const ref = refOf(batch[j]);
      if (st && ref) out.push({ ref, st });
    });
  }
  return out;
}

const unchanged = (hit: FileScan | undefined, st: fs.Stats) => !!hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size;

async function runPass(): Promise<void> {
  const t0 = Date.now();
  const p = S.progress;
  p.state = 'scanning';
  p.startedAt = new Date(t0).toISOString();
  p.error = undefined;
  try {
    const entries = await statAll(await listFiles());
    const seen = new Set(entries.map((e) => e.ref.file));
    let removed = false;
    for (const k of S.files.keys())
      if (!seen.has(k)) {
        S.files.delete(k);
        removed = true;
      }
    if (removed) S.version++;
    const todo = entries.filter((e) => !unchanged(S.files.get(e.ref.file), e.st));
    p.filesTotal = entries.length;
    p.bytesTotal = entries.reduce((n, e) => n + e.st.size, 0);
    p.filesIndexed = entries.length - todo.length;
    p.bytesIndexed = p.bytesTotal - todo.reduce((n, e) => n + e.st.size, 0);
    // People's own sessions before automated ones (claude-mem observer etc.), newest first.
    todo.sort((a, b) => Number(isAutomatedDir(a.ref.projectId)) - Number(isAutomatedDir(b.ref.projectId)) || b.st.mtimeMs - a.st.mtimeMs);
    for (const { ref, st } of todo) {
      const hit = S.files.get(ref.file);
      if (!unchanged(hit, st)) {
        try {
          S.files.set(ref.file, await scanFile(ref, st, hit));
          S.version++;
        } catch {
          // vanished or unreadable mid-scan — picked up next pass
        }
      }
      p.filesIndexed += 1;
      p.bytesIndexed += st.size;
      await yieldLoop();
    }
    p.state = 'ready';
  } catch (err) {
    p.state = 'error';
    p.error = (err as Error).message;
    console.error('[volta sessions] index pass failed', err);
  } finally {
    p.finishedAt = new Date().toISOString();
    p.lastPassMs = Date.now() - t0;
    S.lastPassEnd = Date.now();
    S.pass = null;
  }
}

/** Kick off a background refresh when due; the very first call waits briefly so the newest sessions show. */
async function ensureFresh(): Promise<void> {
  if (!S.pass && Date.now() - S.lastPassEnd > REFRESH_MS) S.pass = runPass();
  if (S.files.size === 0 && S.pass) {
    await Promise.race([S.pass, new Promise((r) => setTimeout(r, FIRST_WAIT_MS))]);
  }
}

// ───────────────────────── Aggregation ─────────────────────────

const zeroTokens = (): SessionTokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 });
function addUsage(t: SessionTokens, u: UsageRec) {
  t.input += u.i;
  t.output += u.o;
  t.cacheRead += u.cr;
  t.cacheWrite += u.cw;
  t.total += u.i + u.o + u.cr + u.cw;
}

function unionMs(files: FileScan[]): number {
  const spans: [number, number][] = [];
  for (const f of files) for (let i = 0; i < f.spans.length; i += 2) spans.push([f.spans[i], f.spans[i + 1]]);
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cs = NaN;
  let ce = NaN;
  for (const [s, e] of spans) {
    if (Number.isNaN(cs)) [cs, ce] = [s, e];
    else if (s <= ce + ACTIVE_GAP_MS) ce = Math.max(ce, e);
    else {
      total += ce - cs;
      [cs, ce] = [s, e];
    }
  }
  if (!Number.isNaN(cs)) total += ce - cs;
  return total;
}

function mergeTools(files: FileScan[]): ToolCount[] {
  const m = new Map<string, ToolCount>();
  for (const f of files)
    for (const [name, [count, errors]] of f.tools) {
      const t = m.get(name) ?? { name, count: 0, errors: 0 };
      t.count += count;
      t.errors += errors;
      m.set(name, t);
    }
  return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function mergeCounts(maps: Map<string, number>[]): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const x of maps) for (const [k, v] of x) bump(m, k, v);
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

interface ProjectInfo {
  id: string;
  path: string; // absolute
  pathSource: 'cwd' | 'decoded';
  automated: boolean;
}

function projectInfo(id: string, files: FileScan[]): ProjectInfo {
  // The directory name is the encoded launch cwd: prefer a cwd that encodes back to it, else the most common one.
  const counts = new Map<string, number>();
  for (const f of files) if (f.cwd && !f.agentId) bump(counts, f.cwd);
  if (!counts.size) for (const f of files) if (f.cwd) bump(counts, f.cwd);
  let best: string | null = null;
  for (const c of counts.keys()) if (encodeCwd(c) === id) best = c;
  if (!best && counts.size) best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const p = best ?? decodeProjectDir(id);
  return { id, path: p, pathSource: best ? 'cwd' : 'decoded', automated: isAutomatedPath(p) };
}

const projectName = (abs: string) => (abs === HOME ? '~' : path.basename(abs) || abs);

interface SessionAgg {
  id: string;
  projectId: string;
  main: FileScan | null;
  subs: FileScan[];
  files: FileScan[];
  summary: ClaudeSessionSummary;
  haystack: string;
}

interface Aggregate {
  sessions: SessionAgg[]; // newest end first
  byId: Map<string, SessionAgg>;
  projects: ClaudeProject[];
  projectInfo: Map<string, ProjectInfo>;
  days: string[];
  totals: ClaudeSessionList['totals'];
}

function sessionTokens(files: FileScan[]): { tokens: SessionTokens; messages: number; models: string[] } {
  const seen = new Set<string>();
  const tokens = zeroTokens();
  const models = new Map<string, number>();
  for (const f of files)
    for (const [id, u] of f.usage) {
      if (seen.has(id)) continue;
      seen.add(id);
      addUsage(tokens, u);
      bump(models, u.model);
    }
  return { tokens, messages: seen.size, models: [...models.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m) };
}

function summarize(id: string, main: FileScan | null, subs: FileScan[], info: ProjectInfo, now: number): ClaudeSessionSummary {
  const files = main ? [main, ...subs] : subs;
  const lead = main ?? subs[0];
  let titleSource: ClaudeSessionSummary['titleSource'] = 'none';
  let title = 'Untitled session';
  const pick: [string | null | undefined, ClaudeSessionSummary['titleSource']][] = [
    [main?.customTitle, 'custom'],
    [main?.aiTitle, 'ai'],
    [main?.summary, 'summary'],
    [main?.firstPrompt, 'prompt'],
    [main?.firstCommand, 'command'],
    [subs[0]?.description ?? subs[0]?.firstPrompt, 'prompt'],
  ];
  for (const [t, src] of pick)
    if (t) {
      title = oneLine(t, TITLE_CHARS);
      titleSource = src;
      break;
    }
  let start = 0;
  let end = 0;
  let mtime = 0;
  let bytes = 0;
  for (const f of files) {
    if (f.firstTs && (!start || f.firstTs < start)) start = f.firstTs;
    if (f.lastTs > end) end = f.lastTs;
    mtime = Math.max(mtime, f.mtimeMs);
    bytes += f.size;
  }
  const { tokens, messages, models } = sessionTokens(files);
  const tools = mergeTools(files);
  return {
    id,
    projectId: lead.projectId,
    projectPath: displayPath(info.path),
    projectName: projectName(info.path),
    automated: info.automated,
    title,
    titleSource,
    firstPrompt: main?.firstPrompt ?? null,
    start: start ? new Date(start).toISOString() : null,
    end: end ? new Date(end).toISOString() : null,
    durationMs: start && end ? end - start : 0,
    activeMs: unionMs(files),
    userPrompts: main?.userPrompts ?? 0,
    assistantMessages: messages,
    toolCalls: tools.reduce((n, t) => n + t.count, 0),
    toolErrors: tools.reduce((n, t) => n + t.errors, 0),
    tokens,
    models,
    topTools: tools.slice(0, 5),
    skills: mergeCounts(files.map((f) => f.skills)).map((s) => s.name),
    subagents: subs.length,
    gitBranch: lead.gitBranch,
    version: lead.version,
    entrypoint: lead.entrypoint,
    bytes,
    live: now - mtime < LIVE_MS,
  };
}

function haystackOf(a: { main: FileScan | null; subs: FileScan[]; summary: ClaudeSessionSummary }): string {
  const s = a.summary;
  const parts = [
    s.id,
    s.title,
    s.projectPath,
    s.gitBranch ?? '',
    s.models.join(' '),
    s.topTools.map((t) => t.name).join(' '),
    s.skills.join(' '),
    a.main?.customTitle ?? '',
    a.main?.aiTitle ?? '',
    a.main?.lastPrompt ?? '',
    ...(a.main?.prompts ?? []),
    ...a.subs.map((x) => `${x.agentType ?? ''} ${x.description ?? ''}`),
  ];
  return parts.join('\n').toLowerCase();
}

function dayKeys(now: number): string[] {
  const d = new Date(now);
  const out: string[] = [];
  // Step back by calendar day (not 24 h) so DST days neither repeat nor drop a date.
  for (let i = 29; i >= 0; i--) out.push(localDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i).getTime()));
  return out;
}

function groupFiles(files: Iterable<FileScan>) {
  const bySession = new Map<string, { main: FileScan | null; subs: FileScan[] }>();
  for (const f of files) {
    const g = bySession.get(f.sessionId) ?? { main: null, subs: [] };
    if (f.agentId) g.subs.push(f);
    else if (!g.main || f.size > g.main.size) g.main = f; // the same id in two project dirs: keep the bigger
    bySession.set(f.sessionId, g);
  }
  return bySession;
}

function buildAggregate(): Aggregate {
  const now = Date.now();
  const all = [...S.files.values()];
  const byProject = new Map<string, FileScan[]>();
  for (const f of all) {
    const list = byProject.get(f.projectId) ?? [];
    list.push(f);
    byProject.set(f.projectId, list);
  }
  const infos = new Map<string, ProjectInfo>();
  for (const [id, files] of byProject) infos.set(id, projectInfo(id, files));

  const sessions: SessionAgg[] = [];
  for (const [id, g] of groupFiles(all)) {
    g.subs.sort((a, b) => a.firstTs - b.firstTs);
    const lead = g.main ?? g.subs[0];
    if (!lead) continue;
    const info = infos.get(lead.projectId) ?? projectInfo(lead.projectId, [lead]);
    const summary = summarize(id, g.main, g.subs, info, now);
    const files = g.main ? [g.main, ...g.subs] : g.subs;
    const a: SessionAgg = { id, projectId: lead.projectId, main: g.main, subs: g.subs, files, summary, haystack: '' };
    a.haystack = haystackOf(a);
    sessions.push(a);
  }
  sessions.sort((a, b) => (b.summary.end ?? '').localeCompare(a.summary.end ?? ''));

  const days = dayKeys(now);
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const projMap = new Map<string, ClaudeProject>();
  const projSeen = new Map<string, Set<string>>();
  const globalSeen = new Set<string>();
  let globalTokens = 0;
  let subagentFiles = 0;
  let bytes = 0;
  for (const a of sessions) {
    const info = infos.get(a.projectId)!;
    let p = projMap.get(a.projectId);
    if (!p) {
      p = {
        id: a.projectId,
        path: displayPath(info.path),
        pathSource: info.pathSource,
        name: projectName(info.path),
        automated: info.automated,
        sessions: 0,
        subagents: 0,
        lastActive: null,
        tokens: 0,
        activity30d: new Array(30).fill(0),
      };
      projMap.set(a.projectId, p);
      projSeen.set(a.projectId, new Set());
    }
    p.sessions += 1;
    p.subagents += a.subs.length;
    subagentFiles += a.subs.length;
    if (a.summary.end && (!p.lastActive || a.summary.end > p.lastActive)) p.lastActive = a.summary.end;
    const seen = projSeen.get(a.projectId)!;
    for (const f of a.files) {
      bytes += f.size;
      for (const [day, n] of f.days) {
        const i = dayIndex.get(day);
        if (i !== undefined) p.activity30d[i] += n;
      }
      for (const [mid, u] of f.usage) {
        const t = u.i + u.o + u.cr + u.cw;
        if (!seen.has(mid)) {
          seen.add(mid);
          p.tokens += t;
        }
        if (!globalSeen.has(mid)) {
          globalSeen.add(mid);
          globalTokens += t;
        }
      }
    }
  }
  const projects = [...projMap.values()].sort((a, b) => (b.lastActive ?? '').localeCompare(a.lastActive ?? ''));
  return {
    sessions,
    byId: new Map(sessions.map((s) => [s.id, s])),
    projects,
    projectInfo: infos,
    days,
    totals: { sessions: sessions.length, projects: projects.length, subagentFiles, tokens: globalTokens, bytes },
  };
}

function aggregate(): Aggregate {
  // Rebuilt only when a file changed; "live" and day buckets refresh with it (and at least every pass).
  if (!S.agg || S.agg.version !== S.version) S.agg = { version: S.version, value: buildAggregate() };
  return S.agg.value;
}

function progressSnapshot(): SessionIndexProgress {
  return { ...S.progress };
}

// ───────────────────────── Public API ─────────────────────────

export interface SessionListQuery {
  q?: string;
  project?: string;
  days?: number;
  automated?: boolean;
  sort?: 'recent' | 'tokens' | 'longest' | 'tools';
  limit?: number;
  offset?: number;
}

export async function listSessions(query: SessionListQuery): Promise<ClaudeSessionList> {
  await ensureFresh();
  const agg = aggregate();
  const now = Date.now();
  const terms = (query.q ?? '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  const cutoff = query.days ? now - query.days * 86_400_000 : 0;
  const selected = query.project ? agg.projects.find((p) => p.id === query.project) : undefined;
  const includeAutomated = query.automated || !!selected?.automated;
  let list = agg.sessions.filter((a) => {
    const s = a.summary;
    if (query.project && a.projectId !== query.project) return false;
    if (!includeAutomated && s.automated) return false;
    if (cutoff && (!s.end || Date.parse(s.end) < cutoff)) return false;
    return terms.every((t) => a.haystack.includes(t));
  });
  if (query.sort === 'tokens') list = [...list].sort((a, b) => b.summary.tokens.total - a.summary.tokens.total);
  else if (query.sort === 'longest') list = [...list].sort((a, b) => b.summary.activeMs - a.summary.activeMs);
  else if (query.sort === 'tools') list = [...list].sort((a, b) => b.summary.toolCalls - a.summary.toolCalls);
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
  const offset = Math.max(query.offset ?? 0, 0);
  return maskDeep({
    progress: progressSnapshot(),
    projects: agg.projects,
    sessions: list.slice(offset, offset + limit).map((a) => a.summary),
    total: list.length,
    offset,
    limit,
    totals: agg.totals,
    days: agg.days,
    generatedAt: new Date(now).toISOString(),
  });
}

export const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

/** Files for one session, scanning them right away when the background index has not reached them. */
async function sessionFiles(id: string): Promise<{ files: FileScan[]; indexed: boolean } | null> {
  const known = [...S.files.values()].filter((f) => f.sessionId === id);
  // Find the session on disk too (cheap: one readdir per project dir) so new subagent files are picked up.
  const found: string[] = [];
  for (const proj of await readdirSafe(PROJECTS_DIR)) {
    if (!proj.isDirectory()) continue;
    const pdir = path.join(PROJECTS_DIR, proj.name);
    const main = path.join(pdir, `${id}.jsonl`);
    const dir = path.join(pdir, id);
    const [mainSt, dirSt] = await Promise.all([fsp.stat(main).catch(() => null), fsp.stat(dir).catch(() => null)]);
    if (mainSt?.isFile()) found.push(main);
    if (dirSt?.isDirectory()) await listSessionDir(dir, found);
  }
  if (!found.length && !known.length) return null;
  const onDisk = new Set(found);
  for (const f of known)
    if (!onDisk.has(f.file)) {
      S.files.delete(f.file); // deleted since the last pass
      S.version++;
    }
  let indexed = true;
  for (const { ref, st } of await statAll(found)) {
    const hit = S.files.get(ref.file);
    if (unchanged(hit, st)) continue;
    indexed = indexed && !!hit;
    try {
      S.files.set(ref.file, await scanFile(ref, st, hit));
      S.version++;
    } catch {
      // unreadable right now
    }
  }
  const files = [...S.files.values()].filter((f) => f.sessionId === id);
  return files.length ? { files, indexed } : null;
}

export async function getSessionDetail(id: string): Promise<ClaudeSessionDetail | null> {
  await ensureFresh();
  const located = await sessionFiles(id);
  if (!located) return null;
  const g = groupFiles(located.files).get(id);
  if (!g) return null;
  g.subs.sort((a, b) => a.firstTs - b.firstTs);
  const lead = g.main ?? g.subs[0];
  const agg = aggregate();
  const info = agg.projectInfo.get(lead.projectId) ?? projectInfo(lead.projectId, located.files);
  const files = g.main ? [g.main, ...g.subs] : g.subs;
  const summary = summarize(id, g.main, g.subs, info, Date.now());

  // Session-level per-model split (message ids deduplicated across main + subagents).
  const seen = new Set<string>();
  const byModel = new Map<string, { model: string; messages: number; tokens: SessionTokens }>();
  const mainTokens = zeroTokens();
  const subagentTokens = zeroTokens();
  for (const f of files)
    for (const [mid, u] of f.usage) {
      if (seen.has(mid)) continue;
      seen.add(mid);
      const m = byModel.get(u.model) ?? { model: u.model, messages: 0, tokens: zeroTokens() };
      m.messages += 1;
      addUsage(m.tokens, u);
      byModel.set(u.model, m);
      addUsage(f.agentId ? subagentTokens : mainTokens, u);
    }

  const subagentList: ClaudeSubagent[] = g.subs.map((f) => {
    const t = sessionTokens([f]);
    return {
      agentId: f.agentId!,
      agentType: f.agentType,
      description: f.description,
      workflow: f.workflow,
      start: f.firstTs ? new Date(f.firstTs).toISOString() : null,
      end: f.lastTs ? new Date(f.lastTs).toISOString() : null,
      assistantMessages: t.messages,
      toolCalls: [...f.tools.values()].reduce((n, [c]) => n + c, 0),
      tokens: t.tokens,
      models: t.models,
      firstPrompt: f.firstPrompt,
      bytes: f.size,
    };
  });

  const branches = [...new Set(files.flatMap((f) => f.branches))];
  const prs = files.flatMap((f) => f.prs).filter((p, i, arr) => arr.findIndex((x) => x.url === p.url) === i);
  const detail: ClaudeSessionDetail = {
    ...summary,
    tools: mergeTools(files),
    skillCounts: mergeCounts(files.map((f) => f.skills)),
    commands: mergeCounts(g.main ? [g.main.commands] : []),
    byModel: [...byModel.values()].sort((a, b) => b.tokens.total - a.tokens.total),
    mainTokens,
    subagentTokens,
    subagentList,
    branches,
    prs,
    lastPrompt: g.main?.lastPrompt ?? null,
    indexed: located.indexed,
  };
  return maskDeep(detail);
}

// ───────────────────────── Transcript pages ─────────────────────────

interface TranscriptCache {
  file: string;
  mtimeMs: number;
  size: number;
  offset: number;
  items: TranscriptItem[];
  toolIndex: Map<string, number>; // tool_use id → index into items
}

const HOME_RE = new RegExp(HOME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
const tidy = (s: string) => s.replace(HOME_RE, '~');

/** Cut at `max`, backing up to whitespace when one is near so a token (possibly a secret) is never split. */
function truncate(s: string, max: number): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false };
  let cut = s.slice(0, max);
  const ws = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'), cut.lastIndexOf('\t'));
  if (ws > max - 120) cut = cut.slice(0, ws);
  return { text: `${cut}…`, truncated: true };
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

/** Short, human summary of a tool call's input. */
export function summarizeTool(name: string, input: Record<string, unknown> | undefined): string {
  const i = input ?? {};
  const first = (s: string | null) => (s ? s.split('\n')[0] : '');
  let out = '';
  switch (name) {
    case 'Bash':
      out = first(str(i.command)) || str(i.description) || '';
      break;
    case 'Read': {
      const off = typeof i.offset === 'number' ? i.offset : null;
      const lim = typeof i.limit === 'number' ? i.limit : null;
      out = `${str(i.file_path) ?? ''}${off != null ? ` :${off}${lim != null ? `+${lim}` : ''}` : ''}`;
      break;
    }
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      out = str(i.file_path) ?? '';
      break;
    case 'NotebookEdit':
      out = str(i.notebook_path) ?? '';
      break;
    case 'Grep':
      out = `/${str(i.pattern) ?? ''}/ ${str(i.path) ?? ''} ${str(i.glob) ?? ''}`;
      break;
    case 'Glob':
      out = `${str(i.pattern) ?? ''} ${str(i.path) ?? ''}`;
      break;
    case 'WebFetch':
      out = str(i.url) ?? '';
      break;
    case 'WebSearch':
    case 'ToolSearch':
      out = str(i.query) ?? '';
      break;
    case 'Task':
    case 'Agent':
      out = [str(i.subagent_type), str(i.description)].filter(Boolean).join(': ');
      break;
    case 'Skill':
      out = [str(i.skill), str(i.args)].filter(Boolean).join(' ');
      break;
    case 'TodoWrite':
      out = Array.isArray(i.todos) ? `${i.todos.length} todos` : '';
      break;
    case 'AskUserQuestion': {
      const qs = Array.isArray(i.questions) ? (i.questions as { question?: unknown }[]) : [];
      out = qs.map((q) => str(q?.question) ?? '').filter(Boolean).join(' · ');
      break;
    }
    default: {
      const pairs: string[] = [];
      for (const [k, v] of Object.entries(i)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') pairs.push(`${k}=${String(v).split('\n')[0]}`);
        if (pairs.length >= 3) break;
      }
      out = pairs.join(' ');
    }
  }
  return oneLine(tidy(out), 200);
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b: { type?: string; text?: string }) => (b?.type === 'text' ? (b.text ?? '') : b?.type === 'image' ? '[image]' : `[${b?.type ?? 'block'}]`))
      .join('\n');
  }
  if (content == null) return '';
  try {
    return JSON.stringify(content);
  } catch {
    return '';
  }
}

const SYSTEM_SUBTYPES: Record<string, string> = {
  compact_boundary: 'context compacted',
  api_error: 'API error',
  away_summary: 'away summary',
  local_command: 'local command',
  model_refusal_fallback: 'model fallback',
  informational: 'info',
};

function pushMeta(tc: TranscriptCache, ts: string | null, label: string, text: string) {
  tc.items.push({ kind: 'meta', ts, label, text: truncate(tidy(text), META_MAX).text });
}

function transcriptLine(buf: Buffer, tc: TranscriptCache) {
  if (buf.length < 16) return;
  const { kind } = classify(buf);
  if (kind === 'skip' || kind === 'meta') return;
  const rec = parse(buf);
  if (!rec) return;
  const ts = rec.timestamp ?? null;
  if (kind === 'system') {
    const label = rec.subtype ? SYSTEM_SUBTYPES[rec.subtype] : undefined;
    if (label) pushMeta(tc, ts, label, typeof rec.content === 'string' ? rec.content : '');
    return;
  }
  const m = rec.message;
  if (!m) return;
  if (kind === 'user' || kind === 'tool-result') {
    if (rec.isCompactSummary) {
      pushMeta(tc, ts, 'compaction summary', resultText(m.content));
      return;
    }
    if (rec.isMeta) {
      const t = resultText(m.content);
      const c = classifyUserText(t);
      if (c.kind === 'command') pushMeta(tc, ts, 'command', `${c.name}${c.args ? ` ${c.args}` : ''}`);
      else if (c.kind === 'meta') pushMeta(tc, ts, c.label, c.text);
      else if (c.kind === 'prompt') {
        const label = t.startsWith('Base directory for this skill')
          ? 'skill instructions'
          : t.startsWith('[MESSAGE FROM NON-USER')
            ? 'non-user message'
            : 'injected context';
        pushMeta(tc, ts, label, c.text);
      }
      return;
    }
    const texts: string[] = [];
    let images = 0;
    if (typeof m.content === 'string') texts.push(m.content);
    else if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b?.type === 'tool_result') {
          const idx = b.tool_use_id ? tc.toolIndex.get(b.tool_use_id) : undefined;
          const raw = tidy(resultText(b.content));
          const item = idx !== undefined ? tc.items[idx] : undefined;
          if (item && item.kind === 'tool') {
            item.result = truncate(raw, TOOL_RESULT_MAX).text;
            item.resultChars = raw.length;
            item.isError = b.is_error === true;
          } else pushMeta(tc, ts, b.is_error ? 'tool error' : 'tool result', raw);
        } else if (b?.type === 'text' && typeof b.text === 'string') texts.push(b.text);
        else if (b?.type === 'image') images += 1;
      }
    }
    let prompt = '';
    for (const t of texts) {
      const c = classifyUserText(t);
      if (c.kind === 'prompt') prompt = prompt ? `${prompt}\n\n${c.text}` : c.text;
      else if (c.kind === 'command') pushMeta(tc, ts, 'command', `${c.name}${c.args ? ` ${c.args}` : ''}`);
      else if (c.kind === 'meta') pushMeta(tc, ts, c.label, c.text);
    }
    if (prompt || images) {
      const t = truncate(tidy(prompt), TEXT_MAX);
      tc.items.push({ kind: 'user', ts, text: t.text, truncated: t.truncated, images, source: rec.promptSource ?? null });
    }
    return;
  }
  // assistant
  if (!Array.isArray(m.content)) return;
  const model = m.model && m.model !== '<synthetic>' ? m.model : null;
  for (const b of m.content) {
    if (b?.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
      const t = truncate(tidy(b.text), TEXT_MAX);
      if (m.model === '<synthetic>') pushMeta(tc, ts, 'harness', t.text);
      else tc.items.push({ kind: 'assistant', ts, model, text: t.text, truncated: t.truncated });
    } else if (b?.type === 'thinking' && typeof b.thinking === 'string' && b.thinking.trim()) {
      const t = truncate(tidy(b.thinking), THINKING_MAX);
      tc.items.push({ kind: 'thinking', ts, text: t.text, truncated: t.truncated });
    } else if ((b?.type === 'tool_use' || b?.type === 'server_tool_use') && typeof b.name === 'string') {
      let input = '';
      try {
        input = JSON.stringify(b.input ?? {}, null, 1);
      } catch {
        input = '';
      }
      const t = truncate(tidy(input), TOOL_INPUT_MAX);
      const id = b.id ?? `anon-${tc.items.length}`;
      tc.toolIndex.set(id, tc.items.length);
      tc.items.push({
        kind: 'tool',
        ts,
        id,
        name: b.name,
        summary: summarizeTool(b.name, b.input),
        input: t.text,
        inputTruncated: t.truncated,
        result: null,
        resultChars: 0,
        isError: false,
      });
    } else if (b?.type && b.type.endsWith('_tool_result') && b.tool_use_id) {
      const idx = tc.toolIndex.get(b.tool_use_id);
      const item = idx !== undefined ? tc.items[idx] : undefined;
      const raw = tidy(resultText(b.content));
      if (item && item.kind === 'tool') {
        item.result = truncate(raw, TOOL_RESULT_MAX).text;
        item.resultChars = raw.length;
      }
    }
  }
}

async function loadTranscript(file: string): Promise<TranscriptCache> {
  const st = await fsp.stat(file);
  const hit = S.transcripts.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
    S.transcripts.delete(file);
    S.transcripts.set(file, hit); // most recently used
    return hit;
  }
  const resume = hit && st.size > hit.size && hit.offset <= st.size;
  const tc: TranscriptCache = resume
    ? { ...hit, items: hit.items, toolIndex: hit.toolIndex }
    : { file, mtimeMs: 0, size: 0, offset: 0, items: [], toolIndex: new Map() };
  // Appending mutates the cached arrays in place; a failure drops the entry so the next read starts clean.
  try {
    tc.offset = await readLines(file, resume ? hit.offset : 0, st.size, (line) => transcriptLine(line, tc));
  } catch (err) {
    S.transcripts.delete(file);
    throw err;
  }
  tc.mtimeMs = st.mtimeMs;
  tc.size = st.size;
  S.transcripts.delete(file);
  S.transcripts.set(file, tc);
  while (S.transcripts.size > TRANSCRIPT_LRU) S.transcripts.delete(S.transcripts.keys().next().value as string);
  return tc;
}

export async function getTranscriptPage(id: string, opts: { agentId?: string | null; offset?: number; limit?: number }): Promise<TranscriptPage | null> {
  const located = await sessionFiles(id);
  if (!located) return null;
  const agentId = opts.agentId ?? null;
  const f = located.files.find((x) => (agentId ? x.agentId === agentId : !x.agentId));
  if (!f) return null;
  const tc = await loadTranscript(f.file);
  const total = tc.items.length;
  const limit = Math.min(Math.max(opts.limit ?? 120, 1), 400);
  let offset = opts.offset ?? 0;
  if (offset < 0) offset = Math.max(0, total - limit); // negative = last page
  offset = Math.min(offset, Math.max(0, total - 1));
  return maskDeep({
    sessionId: id,
    agentId,
    offset,
    limit,
    total,
    items: tc.items.slice(offset, offset + limit),
    bytes: tc.size,
  });
}

// ───────────────────────── claude-mem linkage ─────────────────────────
// The worker's GET /api/observations and /api/summaries accept ?contentSessionId= (the Claude Code session id).

const MEMORY_TTL_MS = 60_000;
const MEMORY_LRU = 24;

function jsonList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string' && v.startsWith('[')) {
    try {
      return jsonList(JSON.parse(v));
    } catch {
      return [];
    }
  }
  return [];
}

async function memFetch(url: string): Promise<unknown> {
  const r = await fetch(url, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
  if (!r.ok) throw new Error(`claude-mem HTTP ${r.status}`);
  return r.json();
}

export async function getSessionMemory(id: string): Promise<SessionMemory> {
  const hit = S.memory.get(id);
  if (hit && Date.now() - hit.at < MEMORY_TTL_MS) return hit.value;
  const q = `contentSessionId=${encodeURIComponent(id)}`;
  let value: SessionMemory;
  try {
    const [obs, sums] = (await Promise.all([
      memFetch(`${CLAUDE_MEM_URL}/api/observations?${q}&limit=60`),
      memFetch(`${CLAUDE_MEM_URL}/api/summaries?${q}&limit=10`).catch(() => ({ items: [] })),
    ])) as [{ items?: Record<string, unknown>[]; hasMore?: boolean }, { items?: Record<string, unknown>[] }];
    const observations: ClaudeMemObservation[] = (obs.items ?? [])
      .filter((o) => o.content_session_id === id || o.content_session_id === undefined)
      .map((o) => ({
        id: Number(o.id) || 0,
        type: str(o.type) ?? 'note',
        title: oneLine(str(o.title) ?? '', 200),
        subtitle: str(o.subtitle),
        narrative: str(o.narrative) ? truncate(String(o.narrative), 1600).text : null,
        facts: jsonList(o.facts).slice(0, 8).map((x) => oneLine(x, 300)),
        filesModified: jsonList(o.files_modified).slice(0, 12).map(tidy),
        promptNumber: typeof o.prompt_number === 'number' ? o.prompt_number : null,
        createdAt: str(o.created_at),
      }));
    const summaries: ClaudeMemSummary[] = (sums.items ?? [])
      .filter((s) => s.session_id === id || s.session_id === undefined)
      .map((s) => ({
        id: Number(s.id) || 0,
        request: str(s.request) ? truncate(String(s.request), 600).text : null,
        investigated: str(s.investigated) ? truncate(String(s.investigated), 900).text : null,
        learned: str(s.learned) ? truncate(String(s.learned), 900).text : null,
        completed: str(s.completed) ? truncate(String(s.completed), 900).text : null,
        nextSteps: str(s.next_steps) ? truncate(String(s.next_steps), 600).text : null,
        createdAt: str(s.created_at),
      }));
    value = maskDeep({ online: true, url: CLAUDE_MEM_URL, observations, hasMore: !!obs.hasMore, summaries });
  } catch (err) {
    value = { online: false, url: CLAUDE_MEM_URL, observations: [], hasMore: false, summaries: [], error: (err as Error).message };
  }
  S.memory.delete(id);
  S.memory.set(id, { at: Date.now(), value });
  while (S.memory.size > MEMORY_LRU) S.memory.delete(S.memory.keys().next().value as string);
  return value;
}
