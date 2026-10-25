import 'server-only';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { complete as omniComplete } from '../llm';
import { LLM_CWD, loadConfig } from './config';
import { errMsg, maskSecrets } from './util';

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
}

type Backend = (req: LlmRequest) => Promise<LlmResult>;

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
  return new Promise<LlmResult>((resolve, reject) => {
    const child = execFile(bin, args, { cwd: LLM_CWD, env: childEnv(bin), timeout: req.timeoutMs, killSignal: 'SIGKILL', maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const why = error.killed ? `timed out after ${Math.round(req.timeoutMs / 1000)}s` : maskSecrets((stderr || error.message).trim().slice(0, 300));
        return reject(new Error(`claude -p (${req.label}): ${why}`));
      }
      try {
        const j = JSON.parse(stdout) as { result?: string; is_error?: boolean; subtype?: string; num_turns?: number; total_cost_usd?: number };
        if (j.is_error || typeof j.result !== 'string' || !j.result.trim()) {
          return reject(new Error(`claude -p (${req.label}): ${j.subtype || 'empty result'}${typeof j.result === 'string' ? ` — ${maskSecrets(j.result.slice(0, 200))}` : ''}`));
        }
        resolve({ text: j.result.trim(), backend: 'claude-cli', model, durationMs: Date.now() - started, turns: j.num_turns, listCostUsd: j.total_cost_usd });
      } catch {
        reject(new Error(`claude -p (${req.label}): unparseable output`));
      }
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
      return await backend(req);
    } catch (e) {
      errors.push(errMsg(e));
    }
  }
  throw new Error(errors.join(' | ') || `no backend for task ${req.task}`);
}
