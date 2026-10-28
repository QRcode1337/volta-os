import 'server-only';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { NleExportJob, NleExportRequest } from '@/types/nle';
import { sequenceDuration } from '@/lib/nle/model';
import { HttpError } from '../../http-error';
import { redactSecrets } from '../../redact';
import { resolveAsset, type NleAsset } from './assets';
import { buildExportGraph } from './filtergraph';
import { assertFreeSpace, writeAtomic } from '../../storage';
import { CACHE_DIR, FFMPEG, LOCAL_EXPORTS_DIR, WINDSOR_EXPORTS_DIR, ensureDir, exportsDir } from './paths';
import { validateSequence } from './projects';

// Export jobs: one ffmpeg at a time, the rest queued. The registry lives on globalThis (survives HMR) and finished
// jobs are mirrored to cache/export-jobs.json so file URLs keep working after a server restart.

export const JOB_ID = /^[0-9a-f]{16}$/;
const JOBS_FILE = path.join(CACHE_DIR, 'export-jobs.json');
const KEEP_JOBS = 50;
const LOG_LINES = 40;

interface Pending {
  req: NleExportRequest;
  assets: Map<string, NleAsset>;
}
interface Registry {
  jobs: Map<string, NleExportJob>;
  pending: Map<string, Pending>;
  queue: string[];
  running: string | null;
  proc: ChildProcess | null;
  partial: string | null;
  loaded: boolean;
}
const g = globalThis as unknown as { __voltaNleExports?: Registry };
const R: Registry = (g.__voltaNleExports ??= { jobs: new Map(), pending: new Map(), queue: [], running: null, proc: null, partial: null, loaded: false });

async function load(): Promise<void> {
  if (R.loaded) return;
  R.loaded = true;
  try {
    const rows = JSON.parse(await fs.readFile(JOBS_FILE, 'utf8')) as NleExportJob[];
    for (const j of rows) if (j && JOB_ID.test(j.id) && !R.jobs.has(j.id)) R.jobs.set(j.id, j);
  } catch {
    // none yet
  }
}

async function persist(): Promise<void> {
  const done = [...R.jobs.values()].filter((j) => j.status === 'done' || j.status === 'error' || j.status === 'cancelled');
  done.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  for (const j of done.slice(KEEP_JOBS)) R.jobs.delete(j.id);
  await writeAtomic(JOBS_FILE, JSON.stringify(done.slice(0, KEEP_JOBS))).catch(() => undefined);
}

const clone = (j: NleExportJob): NleExportJob => ({ ...j });

export async function listJobs(): Promise<NleExportJob[]> {
  await load();
  // forget finished exports whose file was deleted or moved away
  let dropped = false;
  for (const j of [...R.jobs.values()]) {
    const exists = (p: string) => fs.stat(p).then(() => true, () => false);
    // only when the folder is there (an unplugged Windsor drive must not erase the history)
    if (j.status === 'done' && j.outputPath && (await exists(path.dirname(j.outputPath))) && !(await exists(j.outputPath))) {
      R.jobs.delete(j.id);
      dropped = true;
    }
  }
  if (dropped) await persist();
  return [...R.jobs.values()].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, 30).map(clone);
}

export async function getJob(id: string): Promise<NleExportJob> {
  await load();
  if (!JOB_ID.test(id)) throw new HttpError('Bad job id.', 400);
  const j = R.jobs.get(id);
  if (!j) throw new HttpError('Export job not found.', 404);
  return clone(j);
}

/** Finished export file for /api/editor/nle/file?id=x_<jobId> (must sit inside an exports folder). */
export async function exportFile(id: string): Promise<{ path: string; name: string }> {
  const j = await getJob(id);
  if (j.status !== 'done' || !j.outputPath) throw new HttpError('Export is not finished.', 404);
  const dir = path.dirname(j.outputPath);
  if (dir !== WINDSOR_EXPORTS_DIR && dir !== LOCAL_EXPORTS_DIR) throw new HttpError('Export path is outside the exports folder.', 403);
  return { path: j.outputPath, name: path.basename(j.outputPath) };
}

const QUALITY = {
  draft: { crf: 28, preset: 'veryfast', bpp: 0.06 },
  standard: { crf: 21, preset: 'medium', bpp: 0.12 },
  high: { crf: 17, preset: 'slow', bpp: 0.22 },
} as const;

function sanitizeName(raw: unknown): string {
  const s = String(typeof raw === 'string' ? raw : '')
    .replace(/\.mp4$/i, '')
    .replace(/[\u0000-\u001f/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 120);
  return s || 'Untitled edit';
}

function validateRequest(body: Record<string, unknown>): NleExportRequest {
  const sequence = validateSequence(body.sequence);
  const height = body.height == null ? null : Number(body.height);
  if (height !== null && !(Number.isFinite(height) && height >= 64 && height <= 4320)) throw new HttpError('height must be null or 64..4320.', 400);
  const fps = body.fps == null ? null : Number(body.fps);
  if (fps !== null && !(Number.isFinite(fps) && fps >= 1 && fps <= 120)) throw new HttpError('fps must be null or 1..120.', 400);
  const quality = body.quality ?? 'standard';
  if (quality !== 'draft' && quality !== 'standard' && quality !== 'high') throw new HttpError('quality must be draft, standard or high.', 400);
  if (sequenceDuration(sequence) <= 0.01) throw new HttpError('The sequence is empty.', 400);
  if (sequenceDuration(sequence) > 6 * 3600) throw new HttpError('The sequence is longer than 6 hours.', 400);
  return { sequence, height, fps, quality, fileName: sanitizeName(body.fileName ?? sequence.name) };
}

function estimateBytes(req: NleExportRequest): number {
  const s = req.sequence;
  const H = req.height ?? s.height;
  const W = (H * s.width) / s.height;
  const fps = req.fps ?? s.fps;
  const D = sequenceDuration(s);
  return Math.round(((W * H * fps * QUALITY[req.quality].bpp) / 8 + 192_000 / 8) * D);
}

export async function startExport(body: Record<string, unknown>): Promise<NleExportJob> {
  await load();
  const req = validateRequest(body);
  // resolve media now so offline / missing files fail fast with a clear status
  const assets = new Map<string, NleAsset>();
  for (const c of req.sequence.clips) {
    if (c.kind === 'text' || c.kind === 'color' || !c.assetId || assets.has(c.assetId)) continue;
    assets.set(c.assetId, await resolveAsset(c.assetId));
  }
  const dir = await exportsDir();
  await ensureDir(dir);
  await assertFreeSpace(dir, { needBytes: estimateBytes(req), what: 'this export' });
  const id = randomBytes(8).toString('hex');
  const job: NleExportJob = { id, status: 'queued', progress: 0, outputPath: null, url: null, error: null, startedAt: new Date().toISOString(), finishedAt: null, log: '' };
  R.jobs.set(id, job);
  R.pending.set(id, { req, assets });
  R.queue.push(id);
  void pump();
  return clone(job);
}

export async function cancelExport(id: string): Promise<NleExportJob> {
  const j = R.jobs.get(id) ?? (await getJob(id), R.jobs.get(id)!);
  if (j.status === 'queued') {
    R.queue = R.queue.filter((x) => x !== id);
    R.pending.delete(id);
    Object.assign(j, { status: 'cancelled', finishedAt: new Date().toISOString() });
    await persist();
  } else if (j.status === 'running') {
    j.status = 'cancelled';
    j.finishedAt = new Date().toISOString();
    R.proc?.kill('SIGTERM');
    const p = R.proc;
    setTimeout(() => {
      if (p && p.exitCode === null) p.kill('SIGKILL');
    }, 5000);
  }
  return clone(j);
}

async function uniqueOutput(dir: string, base: string): Promise<string> {
  for (let i = 1; i < 1000; i++) {
    const file = path.join(dir, `${base}${i === 1 ? '' : `-${i}`}.mp4`);
    const taken = await fs.stat(file).then(
      () => true,
      () => false,
    );
    const partTaken = await fs.stat(`${file}.part`).then(
      () => true,
      () => false,
    );
    if (!taken && !partTaken) return file;
  }
  throw new HttpError('Too many exports with this name.', 409);
}

async function pump(): Promise<void> {
  if (R.running) return;
  const id = R.queue.shift();
  if (!id) return;
  const job = R.jobs.get(id);
  const pend = R.pending.get(id);
  R.pending.delete(id);
  if (!job || !pend || job.status !== 'queued') return void pump();
  R.running = id;
  job.status = 'running';
  const cancelled = () => (job.status as NleExportJob['status']) === 'cancelled';
  const work = path.join(CACHE_DIR, `export_${id}`);
  const logLines: string[] = [];
  const pushLog = (line: string) => {
    if (!line.trim()) return;
    logLines.push(redactSecrets(line.trimEnd()).slice(0, 400));
    if (logLines.length > LOG_LINES) logLines.splice(0, logLines.length - LOG_LINES);
    job.log = logLines.join('\n');
  };
  let partial: string | null = null;
  try {
    const { req, assets } = pend;
    const tBuild = Date.now();
    const plan = await buildExportGraph({ seq: req.sequence, height: req.height, fps: req.fps, assets });
    for (const n of plan.notes) pushLog(`note: ${n}`);
    if (cancelled()) throw new HttpError('cancelled', 499);
    const dir = await exportsDir();
    await ensureDir(dir);
    await assertFreeSpace(dir, { needBytes: estimateBytes(req), what: 'this export' });
    const out = await uniqueOutput(dir, req.fileName);
    partial = `${out}.part`;
    R.partial = partial;
    await ensureDir(work);
    for (const f of plan.sideFiles) await fs.writeFile(path.join(work, f.name), f.content);
    const graphFile = path.join(work, 'graph.txt');
    await fs.writeFile(graphFile, plan.graph.replaceAll('@WORKDIR@', work));
    const qd = QUALITY[req.quality];
    const args = [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-loglevel',
      'warning',
      ...plan.inputs.flat(),
      '-/filter_complex',
      graphFile,
      '-map',
      '[vout]',
      '-map',
      '[aout]',
      '-c:v',
      'libx264',
      '-preset',
      qd.preset,
      '-crf',
      String(qd.crf),
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(plan.fps),
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-ar',
      '48000',
      '-movflags',
      '+faststart',
      '-t',
      plan.duration.toFixed(3),
      '-progress',
      'pipe:1',
      '-nostats',
      '-f',
      'mp4',
      partial,
    ];
    pushLog(`export ${plan.W}x${plan.H} @ ${plan.fps} fps, ${plan.duration.toFixed(2)} s, ${req.quality} → ${path.basename(out)}`);
    const tRun = Date.now();
    const code = await new Promise<number | null>((resolve) => {
      const p = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      R.proc = p;
      let so = '';
      p.stdout.on('data', (d: Buffer) => {
        so += d.toString();
        const lines = so.split('\n');
        so = lines.pop() ?? '';
        for (const line of lines) {
          const m = /^out_time_us=(\d+)/.exec(line);
          if (m && job.status === 'running') job.progress = Math.max(job.progress, Math.min(0.999, Number(m[1]) / 1e6 / plan.duration));
        }
      });
      let se = '';
      p.stderr.on('data', (d: Buffer) => {
        se += d.toString();
        const lines = se.split('\n');
        se = lines.pop() ?? '';
        lines.forEach(pushLog);
      });
      p.on('error', (e) => {
        pushLog(`ffmpeg failed to start: ${e.message}`);
        resolve(null);
      });
      p.on('close', (c) => {
        if (se) pushLog(se);
        resolve(c);
      });
    });
    R.proc = null;
    pushLog(`graph ${((tRun - tBuild) / 1000).toFixed(1)} s, ffmpeg ${((Date.now() - tRun) / 1000).toFixed(1)} s (exit ${code})`);
    if (cancelled()) throw new HttpError('cancelled', 499);
    if (code !== 0) {
      const cause = [...logLines].reverse().find((l) => /error|invalid|failed|no such|cannot|unable|not found|denied/i.test(l) && !l.startsWith('note:')) ?? logLines[logLines.length - 1] ?? `exit ${code}`;
      throw new HttpError(`ffmpeg failed (exit ${code}): ${cause}`, 500);
    }
    await fs.rename(partial, out);
    partial = null;
    Object.assign(job, { status: 'done', progress: 1, outputPath: out, url: `/api/editor/nle/file?id=x_${id}`, finishedAt: new Date().toISOString() });
  } catch (err) {
    if (cancelled()) {
      pushLog('cancelled');
    } else {
      job.status = 'error';
      job.error = (err as Error).message || 'Export failed.';
      job.finishedAt = new Date().toISOString();
      pushLog(`error: ${job.error}`);
    }
  } finally {
    R.proc = null;
    R.partial = null;
    if (partial) await fs.rm(partial, { force: true }).catch(() => undefined);
    await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
    R.running = null;
    await persist();
    void pump();
  }
}
