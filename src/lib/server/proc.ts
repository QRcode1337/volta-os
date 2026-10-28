import 'server-only';
import { execFile, spawn, type SpawnOptions } from 'node:child_process';
import fs from 'node:fs';
import { HttpError } from './http-error';
import { redactSecrets } from './redact';

// The one way VOLTA starts child processes: binary lookup (with env overrides), bounded run() that never throws,
// runOrThrow() for callers that want an HttpError, spawnLogged() for long jobs that stream output, and mapLimit()
// for bounded fan-out. Error text is always secret-masked and capped.

/** First existing absolute path, else the bare name (resolved through PATH). */
export function bin(name: string, candidates: string[]): string {
  return candidates.find((c) => fs.existsSync(c)) ?? name;
}

const fromEnv = (key: string) => (process.env[key] ?? '').trim() || null;

export const BIN = {
  lsof: bin('lsof', ['/usr/sbin/lsof']),
  ps: bin('ps', ['/bin/ps']),
  launchctl: bin('launchctl', ['/bin/launchctl']),
  plutil: bin('plutil', ['/usr/bin/plutil']),
  df: bin('df', ['/bin/df']),
  du: bin('du', ['/usr/bin/du']),
  nice: bin('nice', ['/usr/bin/nice']),
  sysctl: bin('sysctl', ['/usr/sbin/sysctl']),
  vmStat: bin('vm_stat', ['/usr/bin/vm_stat']),
  memoryPressure: bin('memory_pressure', ['/usr/bin/memory_pressure']),
  open: bin('open', ['/usr/bin/open']),
  git: bin('git', ['/usr/bin/git', '/opt/homebrew/bin/git']),
  docker: bin('docker', ['/usr/local/bin/docker', '/opt/homebrew/bin/docker', '/Applications/Docker.app/Contents/Resources/bin/docker']),
  ffmpeg: fromEnv('VOLTA_FFMPEG') ?? bin('ffmpeg', ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']),
  ffprobe: fromEnv('VOLTA_FFPROBE') ?? bin('ffprobe', ['/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe']),
};

const ERR_MAX = 240;
const baseName = (file: string) => file.split('/').pop() || file;
/** Last non-empty lines of a process's stderr, masked and capped, for error messages. */
export const stderrTail = (text: string, lines = 4) =>
  redactSecrets(
    text
      .trim()
      .split('\n')
      .filter((l) => l.trim())
      .slice(-lines)
      .join(' | '),
  ).slice(0, ERR_MAX);

export interface RunOptions {
  timeoutMs: number;
  maxBuffer?: number;
  cwd?: string;
  /** Merged over process.env (LC_ALL=C is always set so parsed output is stable). */
  env?: NodeJS.ProcessEnv;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  /** Exit code (0 on success); null when the process couldn't start or was killed by the timeout. */
  code: number | null;
  error: string | null;
}

/** execFile that never throws: non-zero exits still return their stdout (df/du print partial results). */
export function run(file: string, args: string[], { timeoutMs, maxBuffer = 4 * 1024 * 1024, cwd, env }: RunOptions): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer, cwd, encoding: 'utf8', env: { ...process.env, ...env, LC_ALL: 'C' } }, (err, stdout, stderr) => {
      if (!err) return resolve({ stdout, stderr, code: 0, error: null });
      const e = err as NodeJS.ErrnoException & { code?: number | string; killed?: boolean };
      const code = typeof e.code === 'number' ? e.code : null;
      const reason =
        e.code === 'ENOENT'
          ? `${baseName(file)} not found`
          : e.killed
            ? `timed out after ${timeoutMs < 1000 ? `${timeoutMs} ms` : `${Math.round(timeoutMs / 1000)}s`}`
            : stderrTail(stderr || e.message || 'failed', 1);
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code, error: redactSecrets(reason).slice(0, ERR_MAX) });
    });
  });
}

/** run(), but a failure (spawn error, timeout, non-zero exit) throws HttpError(`${name} failed: …`, status). */
export async function runOrThrow(file: string, args: string[], opts: RunOptions & { status?: number }): Promise<RunResult> {
  const r = await run(file, args, opts);
  if (r.code === 0) return r;
  // A non-zero exit gets the last few stderr lines (ffmpeg puts the cause there); spawn errors / timeouts keep run()'s reason.
  const why = (r.code !== null && stderrTail(r.stderr)) || r.error || `exit ${r.code}`;
  throw new HttpError(`${baseName(file)} failed: ${why}`, opts.status ?? 500);
}

export interface SpawnLoggedOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Called for every complete stdout / stderr line. */
  onLine?: (line: string, stream: 'stdout' | 'stderr') => void;
  /** Abort → SIGTERM, then SIGKILL after `killAfterMs`. */
  signal?: AbortSignal;
  killAfterMs?: number;
  /** Kill (same escalation) after this long. */
  timeoutMs?: number;
  stdio?: SpawnOptions['stdio'];
}

export interface SpawnResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  /** Masked tail of stderr, for error messages. */
  stderrTail: string;
  killed: boolean;
}

/** Long-running child (renders, exports, encodes): streams lines, never throws; inspect `code`. */
export function spawnLogged(file: string, args: string[], opts: SpawnLoggedOptions = {}): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(file, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: opts.stdio ?? ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let killed = false;
    const pending = { stdout: '', stderr: '' };
    const feed = (stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (stream === 'stderr') stderr = (stderr + text).slice(-16_384);
      if (!opts.onLine) return;
      const parts = (pending[stream] + text).split(/\r?\n|\r/);
      pending[stream] = parts.pop() ?? '';
      for (const l of parts) if (l) opts.onLine(l, stream);
    };
    child.stdout?.on('data', feed('stdout'));
    child.stderr?.on('data', feed('stderr'));
    const kill = () => {
      if (killed || child.exitCode !== null) return;
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => child.exitCode === null && child.kill('SIGKILL'), opts.killAfterMs ?? 5000).unref();
    };
    opts.signal?.addEventListener('abort', kill, { once: true });
    const timer = opts.timeoutMs ? setTimeout(kill, opts.timeoutMs) : null;
    const done = (code: number | null, signal: NodeJS.Signals | null) => {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener('abort', kill);
      for (const s of ['stdout', 'stderr'] as const) if (opts.onLine && pending[s]) opts.onLine(pending[s], s);
      resolve({ code, signal, stderrTail: stderrTail(stderr), killed });
    };
    child.on('error', (err) => {
      stderr += `\n${(err as NodeJS.ErrnoException).code === 'ENOENT' ? `${baseName(file)} not found` : err.message}`;
      done(null, null);
    });
    child.on('close', done);
  });
}

/** Run `fn` over `items` with at most `limit` in flight. Results keep input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return out;
}
