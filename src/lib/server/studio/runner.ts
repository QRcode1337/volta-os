import 'server-only';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { JobStatus, JobsResponse, LogEvent, StudioJob } from '@/types/studio';
import { HttpError } from '../http-error';
import { redactSecrets } from '../redact';
import { buildJob } from './args';
import { JOB_PATH, datalessReason, getPreset, isDataless, getProject, resolveExecutable, type Project, type ProgressKind } from './config';
import { newestOutputSince, parseRemotionCompositions, registerOutput, saveCliCompositions } from './index-projects';
import {
  JOBS_FILE,
  LOGS_DIR,
  STUDIO_ROOT,
  checkStudioStorage,
  ensureStudioDirs,
  isInside,
  projectRendersDir,
  requireStudioStorage,
  windsorMounted,
} from './storage';

// One job at a time (renders are heavy on a 24 GB Mac), niced to 10, run without a shell, in their own process group so
// cancel can SIGTERM (then SIGKILL) the whole tree (npx -> node -> chrome / ffmpeg).

const NICE = '/usr/bin/nice';
const MAX_QUEUE = 20;
const LOG_RING = 5000;
const LINE_MAX = 2000;
const LOG_FILE_MAX = 5 * 1024 ** 2;
const KILL_GRACE_MS = 8000;
const JOB_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const PROGRESS_LOG_EVERY_MS = 2000;
const CAPTURE_MAX = 256 * 1024;

type StreamEvent =
  | ({ type: 'log' } & LogEvent)
  | { type: 'progress'; pct: number | null; label: string }
  | { type: 'status'; job: StudioJob };

interface Runtime {
  job: StudioJob;
  project: Project;
  exe: string;
  argv: string[];
  cwd: string;
  outPath: string | null;
  usesWindsor: boolean;
  progress: ProgressKind;
  expectedSec: number | null;
  log: LogEvent[];
  seq: number;
  listeners: Set<(ev: StreamEvent) => void>;
  child: ChildProcess | null;
  canceling: boolean;
  killTimer: NodeJS.Timeout | null;
  timeoutTimer: NodeJS.Timeout | null;
  timeoutMs: number;
  logStream: fs.WriteStream | null;
  logBytes: number;
  stdout: string;
  stderr: string;
  hook: ((rt: Runtime) => Promise<void>) | null;
  lastProgressLog: number;
}

interface State {
  queue: Runtime[];
  runtimes: Map<string, Runtime>;
  running: Runtime | null;
  history: Map<string, StudioJob> | null;
}
const g = globalThis as unknown as { __voltaStudioRunner?: State };
const S: State = (g.__voltaStudioRunner ??= { queue: [], runtimes: new Map(), running: null, history: null });

const nowIso = () => new Date().toISOString();
const FINAL: JobStatus[] = ['done', 'failed', 'canceled', 'interrupted'];
export const isFinal = (s: JobStatus) => FINAL.includes(s);
export const JOB_ID_RE = /^j_[a-z0-9]{6,24}$/;

// ───────────────────────── history (jobs.jsonl on Windsor) ─────────────────────────

async function appendHistory(job: StudioJob): Promise<void> {
  try {
    if (!(await windsorMounted())) return;
    await fsp.mkdir(STUDIO_ROOT, { recursive: true });
    await fsp.appendFile(JOBS_FILE, `${JSON.stringify(job)}\n`, 'utf8');
  } catch (err) {
    console.error('[studio] could not write job history:', (err as Error).message);
  }
}

async function loadHistory(): Promise<Map<string, StudioJob>> {
  if (S.history) return S.history;
  const map = new Map<string, StudioJob>();
  try {
    if (await windsorMounted()) {
      const st = await fsp.stat(JOBS_FILE);
      const fh = await fsp.open(JOBS_FILE, 'r');
      try {
        const len = Math.min(st.size, 2 * 1024 ** 2);
        const buf = Buffer.alloc(len);
        await fh.read(buf, 0, len, st.size - len);
        const lines = buf.toString('utf8').split('\n');
        if (st.size > len) lines.shift(); // first line may be cut
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const j = JSON.parse(line) as StudioJob;
            if (j && typeof j.id === 'string') map.set(j.id, j);
          } catch {
            // torn line
          }
        }
      } finally {
        await fh.close();
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error('[studio] could not read job history:', (err as Error).message);
  }
  for (const j of map.values()) {
    if (!isFinal(j.status)) {
      j.status = 'interrupted';
      j.error = j.error ?? 'The Studio server restarted while this job was queued or running.';
      j.endedAt = j.endedAt ?? j.startedAt ?? j.createdAt;
    }
  }
  S.history = map;
  return map;
}

// ───────────────────────── public reads ─────────────────────────

export async function listJobs(limit = 60): Promise<JobsResponse> {
  const hist = await loadHistory();
  const all = new Map<string, StudioJob>(hist);
  for (const rt of S.runtimes.values()) all.set(rt.job.id, rt.job);
  const jobs = [...all.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
  return { jobs, storage: await checkStudioStorage(), runningId: S.running?.job.id ?? null };
}

export async function getJob(id: string): Promise<StudioJob | null> {
  const rt = S.runtimes.get(id);
  if (rt) return rt.job;
  return (await loadHistory()).get(id) ?? null;
}

/** Subscribe to a live job: replays buffered log lines after `fromSeq`, then streams. Returns null when the job is not live. */
export function subscribe(id: string, fromSeq: number, cb: (ev: StreamEvent) => void): { unsubscribe: () => void; job: StudioJob } | null {
  const rt = S.runtimes.get(id);
  if (!rt) return null;
  for (const l of rt.log) if (l.seq > fromSeq) cb({ type: 'log', ...l });
  rt.listeners.add(cb);
  return { job: rt.job, unsubscribe: () => rt.listeners.delete(cb) };
}

/** Log of a finished job that is no longer in memory (read from the Windsor log file). */
export async function readLogFile(id: string): Promise<string[]> {
  if (!JOB_ID_RE.test(id)) return [];
  try {
    const text = await fsp.readFile(path.join(LOGS_DIR, `${id}.log`), 'utf8');
    return text.split('\n').filter((l, i, a) => l !== '' || i < a.length - 1);
  } catch {
    return [];
  }
}

export type { StreamEvent };

// ───────────────────────── creating jobs ─────────────────────────

function emit(rt: Runtime, ev: StreamEvent) {
  for (const cb of rt.listeners) {
    try {
      cb(ev);
    } catch {
      rt.listeners.delete(cb);
    }
  }
}

function newRuntime(project: Project, fields: Partial<Runtime> & Pick<Runtime, 'exe' | 'argv' | 'cwd'>, job: Omit<StudioJob, 'id' | 'status' | 'createdAt' | 'startedAt' | 'endedAt' | 'exitCode' | 'signal' | 'error' | 'outputPath' | 'outputId' | 'outputBytes' | 'progress' | 'logLines'>): Runtime {
  const rt: Runtime = {
    project,
    outPath: null,
    usesWindsor: false,
    progress: 'generic',
    expectedSec: null,
    log: [],
    seq: 0,
    listeners: new Set(),
    child: null,
    canceling: false,
    killTimer: null,
    timeoutTimer: null,
    timeoutMs: JOB_TIMEOUT_MS,
    logStream: null,
    logBytes: 0,
    stdout: '',
    stderr: '',
    hook: null,
    lastProgressLog: 0,
    ...fields,
    job: {
      ...job,
      id: `j_${Date.now().toString(36)}${randomBytes(2).toString('hex')}`,
      status: 'queued',
      createdAt: nowIso(),
      startedAt: null,
      endedAt: null,
      exitCode: null,
      signal: null,
      error: null,
      outputPath: null,
      outputId: null,
      outputBytes: null,
      progress: { pct: null, label: 'queued' },
      logLines: 0,
    },
  };
  return rt;
}

function push(rt: Runtime) {
  if (S.queue.length + (S.running ? 1 : 0) >= MAX_QUEUE) throw new HttpError(`The queue is full (${MAX_QUEUE} jobs). Cancel or wait for some to finish.`, 429);
  S.queue.push(rt);
  S.runtimes.set(rt.job.id, rt);
  void pump();
}

/** POST /api/studio/jobs: preset id + validated args only. */
export async function createJob(projectId: unknown, presetId: unknown, args: unknown): Promise<StudioJob> {
  if (typeof projectId !== 'string' || typeof presetId !== 'string') throw new HttpError('projectId and presetId are required.', 400);
  const project = getProject(projectId);
  if (!project) throw new HttpError('Unknown project.', 404);
  const preset = getPreset(project, presetId);
  if (!preset) throw new HttpError('Unknown preset for this project.', 404);
  if (!fs.existsSync(project.path) && !project.path.startsWith(STUDIO_ROOT)) throw new HttpError(`Project folder is missing: ${project.path}`, 400);

  const built = await buildJob(project, preset, args);
  const icloud = datalessReason(project, preset, built.exe);
  if (icloud) throw new HttpError(icloud, 409);
  if (built.usesWindsor) await requireStudioStorage();
  if (project.path.startsWith(STUDIO_ROOT) || built.usesWindsor) await ensureStudioDirs(built.usesWindsor ? project.id : undefined);
  if (built.outPath && !built.usesWindsor) await fsp.mkdir(path.dirname(built.outPath), { recursive: true });
  if (!fs.existsSync(built.cwd)) throw new HttpError(`Working folder is missing: ${built.cwd}`, 400);

  const rt = newRuntime(
    project,
    {
      exe: built.exe,
      argv: built.argv,
      cwd: built.cwd,
      outPath: built.outPath,
      usesWindsor: built.usesWindsor,
      progress: preset.progress,
      expectedSec: built.expectedSec,
    },
    {
      projectId: project.id,
      projectName: project.name,
      presetId: preset.id,
      presetLabel: preset.label,
      args: built.display,
      command: built.command,
    },
  );
  push(rt);
  return rt.job;
}

/** On-demand `remotion compositions` (slow: it bundles the project), run through the same one-at-a-time queue. */
export async function createCompositionsJob(projectId: unknown): Promise<StudioJob> {
  if (typeof projectId !== 'string') throw new HttpError('projectId is required.', 400);
  const project = getProject(projectId);
  if (!project?.compositionsArgv) throw new HttpError('This project has no compositions command configured.', 404);
  const existing = [...S.runtimes.values()].find((r) => r.job.projectId === project.id && r.job.presetId === '__compositions' && !isFinal(r.job.status));
  if (existing) return existing.job;
  const exe = resolveExecutable(project.compositionsArgv[0], project);
  if (!exe) throw new HttpError(`${project.compositionsArgv[0]} is not installed in this project.`, 400);
  if (!fs.existsSync(project.path)) throw new HttpError(`Project folder is missing: ${project.path}`, 400);
  if (isDataless(exe)) throw new HttpError(`${path.basename(exe)} is an iCloud placeholder (evicted from this Mac) and the Studio server cannot download it. Open ${project.path} in Finder, or run brctl download on it, then retry.`, 409);
  const argv = project.compositionsArgv.slice(1);
  const rt = newRuntime(
    project,
    { exe, argv, cwd: project.path, timeoutMs: 5 * 60 * 1000 },
    {
      projectId: project.id,
      projectName: project.name,
      presetId: '__compositions',
      presetLabel: 'List compositions',
      args: {},
      command: `${path.basename(exe)} ${argv.join(' ')}`,
    },
  );
  rt.hook = async (r) => {
    let items = parseRemotionCompositions(r.stdout);
    if (!items.length) items = parseRemotionCompositions(`${r.stdout}\n${r.stderr}`);
    if (!items.length) throw new Error('Could not read any compositions from the CLI output (see log).');
    await saveCliCompositions(r.project.id, items);
    pushLog(r, `[studio] cached ${items.length} composition(s): ${items.map((i) => i.id).join(', ')}`);
  };
  push(rt);
  return rt.job;
}

// ───────────────────────── running ─────────────────────────

async function pump(): Promise<void> {
  if (S.running) return;
  const rt = S.queue.shift();
  if (!rt) return;
  S.running = rt;
  try {
    await start(rt);
  } catch (err) {
    await finish(rt, null, null, (err as Error).message || 'failed to start');
  }
}

function setProgress(rt: Runtime, pct: number | null, label: string) {
  const p = pct === null ? null : Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
  if (rt.job.progress.pct === p && rt.job.progress.label === label) return;
  rt.job.progress = { pct: p ?? rt.job.progress.pct, label };
  emit(rt, { type: 'progress', pct: rt.job.progress.pct, label });
}

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g; // eslint-disable-line no-control-regex

function parseProgress(rt: Runtime, line: string): { pct: number | null; label: string } | null {
  if (rt.progress === 'ffmpeg') {
    const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line);
    if (!m) return null;
    const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    const speed = /speed=\s*([\d.]+)x/.exec(line)?.[1];
    const pct = rt.expectedSec ? Math.min(99, (sec / rt.expectedSec) * 100) : null;
    return { pct, label: `${sec.toFixed(1)}s${rt.expectedSec ? ` of ${rt.expectedSec.toFixed(1)}s` : ''}${speed ? ` · ${speed}x` : ''}` };
  }
  if (rt.progress === 'remotion') {
    const stage = /\b(bundl|render|encod|stitch)/i.exec(line)?.[1]?.toLowerCase();
    if (!stage) return null;
    const ratios = [...line.matchAll(/(\d+)\s*\/\s*(\d+)/g)].filter((m) => !/^\(\d\/\d\)/.test(line.slice(m.index!, m.index! + 5)));
    const last = ratios[ratios.length - 1];
    const pc = /(\d{1,3})(?:\.\d+)?\s*%/.exec(line)?.[1];
    const frac = last && Number(last[2]) > 0 ? Number(last[1]) / Number(last[2]) : pc ? Number(pc) / 100 : null;
    if (frac === null) return null;
    const [base, width, name] = stage === 'bundl' ? [0, 10, 'Bundling'] : stage === 'render' ? [10, 80, 'Rendering'] : [90, 10, 'Encoding'];
    return { pct: base + width * Math.min(1, frac), label: `${name} ${last ? `${last[1]}/${last[2]}` : `${pc}%`}` };
  }
  const pc = /(\d{1,3})(?:\.\d+)?\s*%/.exec(line)?.[1];
  return pc && Number(pc) <= 100 ? { pct: Number(pc), label: `${pc}%` } : null;
}

function pushLog(rt: Runtime, line: string) {
  const text = redactSecrets(line.length > LINE_MAX ? `${line.slice(0, LINE_MAX)}…` : line);
  const ev: LogEvent = { seq: ++rt.seq, line: text };
  rt.log.push(ev);
  if (rt.log.length > LOG_RING) rt.log.splice(0, rt.log.length - LOG_RING);
  rt.job.logLines = rt.seq;
  if (rt.logStream && rt.logBytes < LOG_FILE_MAX) {
    rt.logBytes += text.length + 1;
    rt.logStream.write(`${text}\n`);
  }
  emit(rt, { type: 'log', ...ev });
}

function segment(rt: Runtime, raw: string, transient: boolean) {
  const line = raw.replace(ANSI, '').trimEnd();
  if (!line.trim()) return;
  const prog = parseProgress(rt, line);
  if (prog) setProgress(rt, prog.pct, prog.label);
  if (transient) return; // \r-terminated redraws stay out of the log
  if (prog) {
    const now = Date.now();
    if (now - rt.lastProgressLog < PROGRESS_LOG_EVERY_MS) return;
    rt.lastProgressLog = now;
  }
  pushLog(rt, line);
}

function pump_stream(rt: Runtime, stream: NodeJS.ReadableStream, which: 'stdout' | 'stderr') {
  let buf = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    if (rt[which].length < CAPTURE_MAX) rt[which] += chunk;
    buf += chunk;
    for (;;) {
      const idx = buf.search(/[\r\n]/);
      if (idx < 0) break;
      const ch = buf[idx];
      const seg = buf.slice(0, idx);
      buf = buf.slice(idx + (ch === '\r' && buf[idx + 1] === '\n' ? 2 : 1));
      segment(rt, seg, ch === '\r');
    }
    if (buf.length > 8192) {
      segment(rt, buf, false);
      buf = '';
    }
  });
  stream.on('end', () => {
    if (buf) segment(rt, buf, false);
    buf = '';
  });
}

async function start(rt: Runtime): Promise<void> {
  if (rt.usesWindsor) await requireStudioStorage(); // the drive may have gone while the job waited
  rt.job.status = 'running';
  rt.job.startedAt = nowIso();
  setProgress(rt, rt.progress === 'generic' ? null : 0, 'starting');
  emit(rt, { type: 'status', job: rt.job });
  void appendHistory(rt.job);
  if (await windsorMounted()) {
    try {
      await fsp.mkdir(LOGS_DIR, { recursive: true });
      rt.logStream = fs.createWriteStream(path.join(LOGS_DIR, `${rt.job.id}.log`), { flags: 'a' });
      rt.logStream.on('error', () => (rt.logStream = null));
    } catch {
      rt.logStream = null;
    }
  }
  pushLog(rt, `$ ${rt.job.command}`);
  pushLog(rt, `[studio] cwd ${rt.cwd} · nice 10 · ${rt.job.startedAt}`);

  const env = {
    PATH: JOB_PATH,
    HOME: os.homedir(),
    USER: process.env.USER ?? '',
    LANG: 'en_US.UTF-8',
    TMPDIR: os.tmpdir(),
    FORCE_COLOR: '0',
    NO_COLOR: '1',
    npm_config_update_notifier: 'false',
    npm_config_fund: 'false',
  } as unknown as NodeJS.ProcessEnv;
  // Tool = nice(1); never a shell. argv elements are passed through untouched.
  const child = spawn(NICE, ['-n', '10', rt.exe, ...rt.argv], { cwd: rt.cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  rt.child = child;
  if (rt.canceling) killJob(rt);
  pump_stream(rt, child.stdout, 'stdout');
  pump_stream(rt, child.stderr, 'stderr');
  rt.timeoutTimer = setTimeout(() => {
    pushLog(rt, `[studio] timed out after ${Math.round(rt.timeoutMs / 60000)} min, stopping`);
    killJob(rt);
  }, rt.timeoutMs);
  let done = false;
  child.on('error', (err) => {
    if (done) return;
    done = true;
    void finish(rt, null, null, `Could not start: ${err.message}`);
  });
  child.on('close', (code, signal) => {
    if (done) return;
    done = true;
    void finish(rt, code, signal, null);
  });
}

function signalGroup(rt: Runtime, sig: NodeJS.Signals) {
  const pid = rt.child?.pid;
  if (!pid) return;
  try {
    process.kill(-pid, sig);
  } catch {
    try {
      rt.child?.kill(sig);
    } catch {
      // already gone
    }
  }
}

function killJob(rt: Runtime) {
  rt.canceling = true;
  signalGroup(rt, 'SIGTERM');
  if (!rt.killTimer) {
    rt.killTimer = setTimeout(() => {
      pushLog(rt, '[studio] still running after SIGTERM, sending SIGKILL');
      signalGroup(rt, 'SIGKILL');
    }, KILL_GRACE_MS);
  }
}

async function finish(rt: Runtime, code: number | null, signal: NodeJS.Signals | null, startError: string | null): Promise<void> {
  if (rt.timeoutTimer) clearTimeout(rt.timeoutTimer);
  if (rt.killTimer) clearTimeout(rt.killTimer);
  rt.child = null;
  rt.job.exitCode = code;
  rt.job.signal = signal;
  let status: JobStatus;
  let error: string | null = null;
  if (rt.canceling) {
    status = 'canceled';
    error = 'Canceled.';
  } else if (startError) {
    status = 'failed';
    error = startError;
  } else if (code === 0) {
    status = 'done';
  } else {
    status = 'failed';
    error = signal ? `Killed by ${signal}.` : `Exited with code ${code}.`;
  }

  if (status === 'failed' && /Resource deadlock avoided/.test(`${rt.stderr}${rt.stdout}`)) {
    error = 'A file this command needs is an iCloud placeholder (evicted from this Mac) and the Studio server cannot download it. Open the project folder in Finder (or run brctl download on it), then retry.';
  }
  if (status === 'done') {
    try {
      if (rt.outPath) {
        const st = await fsp.stat(rt.outPath).catch(() => null);
        if (!st || st.size === 0) {
          status = 'failed';
          error = 'The command exited 0 but wrote no output file.';
        } else {
          const out = await registerOutput(rt.project, rt.outPath);
          rt.job.outputPath = rt.outPath;
          rt.job.outputBytes = st.size;
          rt.job.outputId = out?.id ?? null;
        }
      } else if (rt.job.startedAt && !rt.job.presetId.startsWith('__')) {
        const out = await newestOutputSince(rt.project, Date.parse(rt.job.startedAt));
        if (out) {
          rt.job.outputPath = out.path;
          rt.job.outputBytes = out.size;
          rt.job.outputId = out.id;
        }
      }
      if (status === 'done' && rt.hook) await rt.hook(rt);
    } catch (err) {
      status = 'failed';
      error = (err as Error).message;
    }
  }
  if (status !== 'done' && rt.outPath) {
    // remove a partial render (rt.outPath is always inside the folder Studio allocated for this job)
    const dir = path.dirname(rt.outPath);
    const ours = (await isInside(dir, projectRendersDir(rt.project.id)).catch(() => false)) || (await isInside(dir, rt.project.path).catch(() => false));
    if (ours) await fsp.rm(rt.outPath, { force: true }).catch(() => undefined);
  }

  rt.job.status = status;
  rt.job.error = error ? redactSecrets(error) : null;
  rt.job.endedAt = nowIso();
  if (status === 'done') rt.job.progress = { pct: 100, label: 'done' };
  else rt.job.progress = { pct: rt.job.progress.pct, label: status };
  if (error) pushLog(rt, `[studio] ${rt.job.error}`);
  pushLog(rt, `[studio] ${status}${code !== null ? ` (exit ${code})` : ''}${rt.job.outputPath ? ` → ${rt.job.outputPath}` : ''}`);
  rt.logStream?.end();
  rt.logStream = null;
  emit(rt, { type: 'status', job: rt.job });
  await appendHistory(rt.job);
  (await loadHistory()).set(rt.job.id, rt.job);
  // keep the runtime (for log replay) until it is old; drop the oldest finished ones
  const finished = [...S.runtimes.values()].filter((r) => isFinal(r.job.status));
  if (finished.length > 30) for (const r of finished.slice(0, finished.length - 30)) S.runtimes.delete(r.job.id);
  S.running = null;
  void pump();
}

/** Cancel: queued jobs are dropped; a running job gets SIGTERM, then SIGKILL after 8 s. */
export async function cancelJob(id: string): Promise<StudioJob> {
  const rt = S.runtimes.get(id);
  if (!rt) throw new HttpError('Job not found (only queued or running jobs can be canceled).', 404);
  if (rt.job.status === 'queued') {
    S.queue = S.queue.filter((r) => r !== rt);
    rt.job.status = 'canceled';
    rt.job.error = 'Canceled before it started.';
    rt.job.endedAt = nowIso();
    rt.job.progress = { pct: null, label: 'canceled' };
    emit(rt, { type: 'status', job: rt.job });
    await appendHistory(rt.job);
    return rt.job;
  }
  if (rt.job.status === 'running') {
    pushLog(rt, '[studio] cancel requested: SIGTERM');
    killJob(rt);
    return rt.job;
  }
  throw new HttpError(`Job already ${rt.job.status}.`, 409);
}
