import 'server-only';
import { redactSecrets } from '../redact';
import { ClaudeCliError, runClaudeCli } from '../claude';
import { complete as omniComplete } from '../llm';
import { LLM_CWD, loadConfig } from './config';
import { clip, errMsg } from './util';

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

// ───────────── backend: claude -p (Max plan, via the shared runner in src/lib/server/claude.ts) ─────────────

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
export function describeClaudeFailure(error: ClaudeCliError | null, stdout: string, stderr: string, timeoutMs: number): string {
  const d = error?.detail;
  if (d?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return 'output exceeded the 32 MB buffer';
  if (d?.killed) return `timed out after ${Math.round(timeoutMs / 1000)}s`; // `killed` is only set when Node itself killed it (the timeout)
  if (d?.notFound) return 'claude CLI not found (set VOLTA_CLAUDE_BIN)';
  const parts: string[] = [];
  const j = stdout.trim() ? parseClaudeJson(stdout) : null;
  if (j) {
    const why = jsonReason(j);
    if (why) parts.push(why);
  } else if (stdout.trim()) {
    parts.push(`stdout: ${oneLine(stdout).slice(-400)}`);
  }
  if (stderr.trim()) parts.push(`stderr: ${oneLine(stderr).slice(-400)}`);
  if (d) {
    if (typeof d.code === 'string') parts.push(`could not start the CLI (${d.code})`);
    else if (typeof d.code === 'number') parts.push(`exit code ${d.code}`);
    else parts.push('killed by a signal'); // no exit code and not our timeout
  }
  if (!parts.length) parts.push(error ? 'failed with no output' : 'empty result');
  return clip(redactSecrets(parts.join(' · ')), 600);
}

const claudeCli: Backend = async (req) => {
  const model = claudeModel(req.task);
  const args = [
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
  let out: { stdout: string; stderr: string; ms: number };
  try {
    out = await runClaudeCli({ args, prompt: req.prompt, cwd: LLM_CWD, timeoutMs: req.timeoutMs, maxBuffer: 32 * 1024 * 1024, task: `podcast:${req.task}`, model });
  } catch (e) {
    if (e instanceof ClaudeCliError) throw new Error(`claude -p (${req.label}): ${describeClaudeFailure(e, e.detail.stdout, e.detail.stderr, req.timeoutMs)}`);
    throw new Error(`claude -p (${req.label}): ${errMsg(e)}`);
  }
  const { stdout, stderr } = out;
  const j = parseClaudeJson(stdout);
  if (!j) throw new Error(`claude -p (${req.label}): unparseable output${stdout.trim() ? ` — ${clip(redactSecrets(oneLine(stdout)), 300)}` : ' (stdout empty)'}`);
  if (j.is_error || typeof j.result !== 'string' || !j.result.trim()) {
    throw new Error(`claude -p (${req.label}): ${describeClaudeFailure(null, stdout, stderr, req.timeoutMs)}`);
  }
  return { text: j.result.trim(), backend: 'claude-cli', model, durationMs: out.ms, turns: j.num_turns, listCostUsd: j.total_cost_usd };
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
