import 'server-only';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { groundRules } from '@/lib/agent-guardrails';
import { logUsage } from './llm/usage-log';
import { redactSecrets } from './redact';

// Every way VOLTA hands work to Claude Code:
// - handoffToClaude: an *interactive* session in a new Terminal window on the Mac (Systems "Fix with agent", Tasks
//   "Solve with agent"), with the shared ground rules appended and every handoff logged. Your normal permission
//   prompts apply, so nothing runs unattended.
// - runClaudeCli: a headless `claude -p` call (podcast fallback, skills/run live mode) on the Max plan, logged to the
//   LLM usage log like the gateway calls.

const STATE_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'VOLTA');
/** Prompt files handed to Terminal: tiny, and off iCloud so `cat` never meets an evicted file. */
const PROMPTS_DIR = path.join(STATE_DIR, 'agent-prompts');
const HANDOFF_LOG = path.join(STATE_DIR, 'agent-log.jsonl');
const OSASCRIPT = '/usr/bin/osascript';
const KEEP = 50;

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
/** AppleScript string literal. */
const asString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
/** Single-quoted shell word. */
const shQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

function prune() {
  try {
    const files = fs.readdirSync(PROMPTS_DIR).filter((f) => f.endsWith('.md')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - KEEP))) fs.unlinkSync(path.join(PROMPTS_DIR, f));
  } catch {
    // best effort
  }
}

function openClaudeInTerminal(prompt: string, opts: { cwd: string; tag: string }): Promise<{ opened: boolean; error: string | null }> {
  fs.mkdirSync(PROMPTS_DIR, { recursive: true });
  const file = path.join(PROMPTS_DIR, `${opts.tag}-${stamp()}.md`);
  fs.writeFileSync(file, prompt);
  prune();
  // The prompt travels as a file (`cat`), never in argv. osascript runs with the server's own locale, not LC_ALL=C,
  // so non-ASCII paths in the command survive.
  const shell = `cd ${shQuote(opts.cwd)} && claude "$(cat ${shQuote(file)})"`;
  const args = ['-e', `tell application "Terminal" to do script ${asString(shell)}`, '-e', 'tell application "Terminal" to activate'];
  return new Promise((resolve) => {
    execFile(OSASCRIPT, args, { timeout: 10_000 }, (err, _stdout, stderr) => {
      resolve(err ? { opened: false, error: redactSecrets((stderr || err.message).trim()).slice(0, 300) } : { opened: true, error: null });
    });
  });
}

export interface Handoff {
  prompt: string;
  opened: boolean;
  error: string | null;
}

/**
 * Build a Claude Code prompt from an item-specific `body` plus the shared ground rules (and any task-specific `rules`).
 * With `open`, also start it in Terminal (only possible on the Mac itself). Every opened handoff is logged.
 */
export async function handoffToClaude(opts: {
  tag: string;
  cwd: string;
  body: string;
  rules?: readonly string[];
  open: boolean;
  /** Extra fields for the handoff log (item ids, titles). */
  log?: Record<string, unknown>;
}): Promise<Handoff> {
  const prompt = `${opts.body.trim()}\n\n${groundRules(opts.rules)}`;
  if (!opts.open) return { prompt, opened: false, error: null };
  const res = await openClaudeInTerminal(prompt, { cwd: opts.cwd, tag: opts.tag });
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFileSync(HANDOFF_LOG, `${JSON.stringify({ at: new Date().toISOString(), tag: opts.tag, cwd: opts.cwd, ...opts.log, ...res })}\n`);
  } catch {
    // the handoff happened; a log failure must not hide that
  }
  return { prompt, ...res };
}

// ── headless claude -p ──

let binMemo: string | null | undefined;

/** The claude CLI, found even under launchd's minimal PATH (the mise node bin dir is not on it). VOLTA_CLAUDE_BIN overrides. */
export function claudeBin(): string | null {
  if (binMemo !== undefined) return binMemo;
  const home = os.homedir();
  const cands: string[] = [
    process.env.VOLTA_CLAUDE_BIN ?? '',
    process.env.PODCAST_CLAUDE_BIN ?? '',
    path.join(home, '.local', 'bin', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
  try {
    const base = path.join(home, '.local', 'share', 'mise', 'installs', 'node');
    for (const v of fs.readdirSync(base).sort().reverse()) cands.push(path.join(base, v, 'bin', 'claude'));
  } catch {
    // no mise
  }
  binMemo = cands.find((c) => c && fs.existsSync(c)) ?? null;
  return binMemo;
}

/** Max plan only: never let an API key flip the CLI to metered billing; PATH gets the dirs claude's hooks expect. */
function cliEnv(bin: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) delete env[k];
  const extra = [path.dirname(bin), path.join(os.homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  env.PATH = [...extra, ...(env.PATH ?? '').split(':')].filter(Boolean).join(':');
  return env;
}

export class ClaudeCliError extends Error {
  constructor(
    message: string,
    readonly detail: { killed: boolean; notFound: boolean; code: number | string | null; stdout: string; stderr: string },
  ) {
    super(message);
    this.name = 'ClaudeCliError';
  }
}

export interface ClaudeCliRequest {
  /** Flags after `-p` (model, output format, permission mode, tools …). The prompt goes on stdin, never argv. */
  args: readonly string[];
  prompt: string;
  cwd: string;
  timeoutMs: number;
  /** Usage-log task name (e.g. 'podcast:long-write', 'skills:run'). */
  task: string;
  model?: string;
  maxBuffer?: number;
}

/** Run `claude -p` once and return its stdout. Logged to the LLM usage log (via 'claude-cli'), ok or not. */
export function runClaudeCli(req: ClaudeCliRequest): Promise<{ stdout: string; stderr: string; ms: number }> {
  const bin = claudeBin();
  const started = Date.now();
  const log = (ok: boolean, error?: string) =>
    logUsage({
      ts: new Date(started).toISOString(),
      task: req.task,
      target: 'claude -p',
      via: 'claude-cli',
      ok,
      stream: false,
      attempt: 1,
      ms: Date.now() - started,
      model: req.model ?? null,
      ...(error ? { error: { kind: 'server' as const, message: error.slice(0, 200) } } : {}),
    });
  if (!bin) {
    log(false, 'claude CLI not found');
    return Promise.reject(new ClaudeCliError('claude CLI not found (set VOLTA_CLAUDE_BIN)', { killed: false, notFound: true, code: 'ENOENT', stdout: '', stderr: '' }));
  }
  fs.mkdirSync(req.cwd, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = execFile(
      bin,
      ['-p', ...req.args],
      { cwd: req.cwd, env: cliEnv(bin), timeout: req.timeoutMs, killSignal: 'SIGKILL', maxBuffer: req.maxBuffer ?? 32 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          const e = error as NodeJS.ErrnoException & { killed?: boolean; code?: number | string };
          const detail = { killed: !!e.killed, notFound: e.code === 'ENOENT', code: e.code ?? null, stdout: stdout ?? '', stderr: stderr ?? '' };
          const message = detail.killed ? `timed out after ${Math.round(req.timeoutMs / 1000)}s` : detail.notFound ? 'claude CLI not found' : redactSecrets((stderr || e.message).trim()).slice(0, 300);
          log(false, message);
          return reject(new ClaudeCliError(message, detail));
        }
        log(true);
        resolve({ stdout, stderr, ms: Date.now() - started });
      },
    );
    child.stdin?.on('error', () => {});
    child.stdin?.end(req.prompt);
  });
}
