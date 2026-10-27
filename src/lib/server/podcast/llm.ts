import 'server-only';
import { execFile, type ExecFileException } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { complete as omniComplete } from '../llm';
import { LLM_CWD, loadConfig } from './config';
import { clip, errMsg, maskSecrets } from './util';

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// The ONE place the podcast talks to an LLM. Every stage calls `llm({ task, ... })` with a task name that matches
// the OmniRoute gateway's task→combo routing (config/llm-routes.json): research-web, long-write, quick, deep-reasoning.
//
// Text-only tasks (long-write, quick, deep-reasoning) go to the OmniRoute helper (src/lib/server/llm, which ends in local
// LM Studio) with `claude -p` on the Max plan as the fallback. `research-web` stays on `claude -p` with WebSearch/WebFetch
// because the gateway has no live web search (liveWeb:false); ANTHROPIC_API_KEY is stripped from the child env so the CLI
// can never fall back to API billing. To change a task's backend, edit that task's line in ROUTES (a one-line change).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export type LlmTask = 'research-web' | 'long-write' | 'quick' | 'deep-reasoning';

export interface LlmRequest {
  task: LlmTask;
  /** Short label for logs/errors. */
  label: string;
  system: string;
  prompt: string;
  /** Allow live WebSearch + WebFetch (research only). */
  web?: boolean;
  timeoutMs: number;
}

export interface LlmResult {
  text: string;
  backend: string;
  model: string;
  durationMs: number;
  turns?: number;
  /** claude -p list-price equivalent (informational; the Max plan is not billed per token). */
  listCostUsd?: number;
  /** Errors from the backends earlier in the task's chain that failed before this one answered (empty: the primary answered). */
  fallbackFrom: string[];
}

type Backend = (req: LlmRequest) => Promise<Omit<LlmResult, 'fallbackFrom'>>;

// ───────────── backend: claude -p (Max plan) ─────────────

let claudeBinMemo: string | null | undefined;

/** Resolve the claude CLI even under launchd's minimal PATH (the mise node bin dir is not on it). */
export function claudeBin(): string | null {
  if (claudeBinMemo !== undefined) return claudeBinMemo;
  const home = os.homedir();
  const cands: string[] = [process.env.PODCAST_CLAUDE_BIN ?? '', path.join(home, '.local', 'bin', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
  try {
    const base = path.join(home, '.local', 'share', 'mise', 'installs', 'node');
    for (const v of fs.readdirSync(base).sort().reverse()) cands.push(path.join(base, v, 'bin', 'claude'));
  } catch {
    // no mise
  }
  claudeBinMemo = cands.find((c) => c && fs.existsSync(c)) ?? null;
  return claudeBinMemo;
}

function childEnv(bin: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Max plan only: never let an API key flip the CLI to metered billing.
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) delete env[k];
  const extra = [path.dirname(bin), path.join(os.homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  env.PATH = [...extra, ...(env.PATH ?? '').split(':')].filter(Boolean).join(':');
  return env;
}

const claudeModel = (task: LlmTask): string => {
  const c = loadConfig();
  return task === 'research-web' ? c.research.model : task === 'quick' ? c.quick.model : task === 'deep-reasoning' ? 'opus' : c.script.model;
};

interface ClaudeJson {
  result?: unknown;
  is_error?: boolean;
  subtype?: string;
  error?: unknown;
  api_error_status?: number | null;
  num_turns?: number;
  total_cost_usd?: number;
}

/** `--output-format json` prints one JSON object; take the last line that parses (anything before it is noise). */
function parseClaudeJson(stdout: string): ClaudeJson | null {
  const lines = stdout.trim().split('\n').reverse();
  for (const l of lines) {
    const t = l.trim();
    if (!t.startsWith('{')) continue;
    try {
      return JSON.parse(t) as ClaudeJson;
    } catch {
      // not this line
    }
  }
  try {
    return JSON.parse(stdout) as ClaudeJson; // pretty-printed across lines
  } catch {
    return null;
  }
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The CLI's own explanation from its JSON: the error result text, an explicit error field, the subtype and HTTP status. */
function jsonReason(j: ClaudeJson): string {
  const parts: string[] = [];
  if (typeof j.result === 'string' && j.result.trim()) parts.push(oneLine(j.result));
  if (typeof j.error === 'string' && j.error.trim()) parts.push(oneLine(j.error));
  else if (j.error && typeof j.error === 'object') parts.push(oneLine(JSON.stringify(j.error)));
  if (j.subtype && j.subtype !== 'success') parts.push(`[${j.subtype}]`);
  if (typeof j.api_error_status === 'number') parts.push(`(HTTP ${j.api_error_status})`);
  return parts.join(' ');
}

/**
 * Why a `claude -p` call failed, in words the user can act on. With `--output-format json` the CLI reports most failures
 * (login, quota, rate limit, max turns) as JSON on STDOUT with a non-zero exit, and stderr is often empty. Node's
 * `error.message` is just "Command failed: <the whole argv>", which carries the system prompt and no reason, so it is
 * never used. Secrets are masked; the result is capped so it fits in a warning.
 */
export function describeClaudeFailure(error: ExecFileException | null, stdout: string, stderr: string, timeoutMs: number): string {
  if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return 'output exceeded the 32 MB buffer';
  if (error?.killed) return `timed out after ${Math.round(timeoutMs / 1000)}s`; // `killed` is only set when Node itself killed it (the timeout)
  const parts: string[] = [];
  const j = stdout.trim() ? parseClaudeJson(stdout) : null;
  if (j) {
    const why = jsonReason(j);
    if (why) parts.push(why);
  } else if (stdout.trim()) {
    parts.push(`stdout: ${oneLine(stdout).slice(-400)}`);
  }
  if (stderr.trim()) parts.push(`stderr: ${oneLine(stderr).slice(-400)}`);
  if (error) {
    const code = error.code;
    if (typeof code === 'string') parts.push(`could not start the CLI (${code})`);
    else if (typeof code === 'number') parts.push(`exit code ${code}`);
    else if (error.signal) parts.push(`killed by ${error.signal}`);
  }
  if (!parts.length) parts.push(error ? 'failed with no output' : 'empty result');
  return clip(maskSecrets(parts.join(' · ')), 600);
}

const claudeCli: Backend = (req) => {
  const bin = claudeBin();
  if (!bin) return Promise.reject(new Error('claude CLI not found (set PODCAST_CLAUDE_BIN)'));
  fs.mkdirSync(LLM_CWD, { recursive: true });
  const model = claudeModel(req.task);
  const args = [
    '-p',
    '--model',
    model,
    '--output-format',
    'json',
    '--no-session-persistence',
    '--strict-mcp-config',
    '--permission-mode',
    'dontAsk',
    `--system-prompt=${req.system}`,
    // Web tools only for research; everything else runs with no tools at all.
    req.web ? '--allowedTools=WebSearch,WebFetch' : '--tools=',
  ];
  const started = Date.now();
  return new Promise<Omit<LlmResult, 'fallbackFrom'>>((resolve, reject) => {
    const child = execFile(bin, args, { cwd: LLM_CWD, env: childEnv(bin), timeout: req.timeoutMs, killSignal: 'SIGKILL', maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`claude -p (${req.label}): ${describeClaudeFailure(error, stdout, stderr, req.timeoutMs)}`));
      const j = parseClaudeJson(stdout);
      if (!j) return reject(new Error(`claude -p (${req.label}): unparseable output${stdout.trim() ? ` — ${clip(maskSecrets(oneLine(stdout)), 300)}` : ' (stdout empty)'}`));
      if (j.is_error || typeof j.result !== 'string' || !j.result.trim()) {
        return reject(new Error(`claude -p (${req.label}): ${describeClaudeFailure(null, stdout, stderr, req.timeoutMs)}`));
      }
      resolve({ text: j.result.trim(), backend: 'claude-cli', model, durationMs: Date.now() - started, turns: j.num_turns, listCostUsd: j.total_cost_usd });
    });
    child.stdin?.on('error', () => {});
    child.stdin?.end(req.prompt); // prompt via stdin: no argv length limits, no variadic-flag swallowing
  });
};

// ───────────── backend: OmniRoute gateway (src/lib/server/llm, config/llm-routes.json) ─────────────

/** Task→combo routing lives in config/llm-routes.json; the helper itself ends in local LM Studio. No live web search. */
const omniRoute = (task: LlmTask): Backend => async (req) => {
  const r = await omniComplete({
    task,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.prompt },
    ],
    timeoutMs: req.timeoutMs,
  });
  return { text: r.text.trim(), backend: `omniroute:${r.route.target}`, model: r.route.model ?? r.route.target, durationMs: r.latencyMs };
};

// ───────────── routing: task → ordered backends (first success wins) ─────────────

const ROUTES: Record<LlmTask, Backend[]> = {
  'research-web': [claudeCli], // needs live WebSearch/WebFetch; the gateway has no live web for an OAuth-only key (liveWeb:false)
  'long-write': [omniRoute('long-write'), claudeCli], // the script. claude -p (Max plan) is the fallback if the gateway chain fails
  quick: [omniRoute('quick'), claudeCli], // episode titles / blurbs: local qwen first
  'deep-reasoning': [omniRoute('deep-reasoning'), claudeCli],
};

export async function llm(req: LlmRequest): Promise<LlmResult> {
  const errors: string[] = [];
  for (const backend of ROUTES[req.task]) {
    try {
      return { ...(await backend(req)), fallbackFrom: [...errors] };
    } catch (e) {
      errors.push(errMsg(e));
    }
  }
  throw new Error(errors.join(' | ') || `no backend for task ${req.task}`);
}
