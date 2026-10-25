import 'server-only';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import type { GenItemRecord, GenRequest, ImageRequest, JobState, MediaKind, MediaProvider, VideoRequest, VoiceRequest } from '@/types/media';
import { MediaError, errorMessage } from './config';
import { getQuota, synthesize } from './elevenlabs';
import { registry, rateLimit } from './quotes';
import { allocOutput, appendManifest, mimeForExt, requireStorage, sniffImageExt } from './storage';
import { downloadVideoTo, generateImages, pollVideo, submitVideo } from './xai';
import { round6 } from './pricing';

const jobs: Map<string, JobState> = ((globalThis as unknown as { __voltaMediaJobs?: Map<string, JobState> }).__voltaMediaJobs ??= new Map());

const POLL_MS = 5_000;
const VIDEO_MAX_MS = 15 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function getJob(id: string): JobState | null {
  return jobs.get(id) ?? null;
}

/**
 * The only path that spends money. Requires a quote that exists, is unexpired and unused; takes a single global
 * in-flight lock synchronously (so a double-click or second tab can't submit twice) and consumes the quote
 * before the first provider call.
 */
export async function startGeneration(quoteId: unknown): Promise<{ jobId: string }> {
  if (typeof quoteId !== 'string' || !/^q_[0-9a-f]{24}$/.test(quoteId)) throw new MediaError('quoteId is required (POST /api/media/quote first).', 400);
  if (registry.inflight) throw new MediaError('A generation is already running; wait for it to finish.', 429);
  const stored = registry.quotes.get(quoteId);
  if (!stored) throw new MediaError('Unknown quote. Request a new estimate.', 404);
  if (stored.used) throw new MediaError('This quote was already used. Request a new estimate.', 409);
  if (stored.expiresAt < Date.now()) throw new MediaError('Quote expired. Request a new estimate.', 410);

  const jobId = `j_${randomBytes(8).toString('hex')}`;
  registry.inflight = jobId; // sync, before any await
  try {
    rateLimit(registry.recentGenerates, 10, 60_000, 'generate');
    await requireStorage();
    if (stored.req.kind === 'voice') {
      const quota = await getQuota();
      if ((stored.credits ?? 0) > quota.remaining) throw new MediaError('Not enough ElevenLabs credits left for this request.', 422);
    }
    if (stored.used || stored.expiresAt < Date.now()) throw new MediaError('Quote no longer valid.', 409);
    stored.used = true; // consumed before spending
  } catch (err) {
    registry.inflight = null;
    throw err;
  }

  const job: JobState = { id: jobId, status: 'running', kind: stored.req.kind, startedAt: new Date().toISOString(), progress: 'starting', items: [] };
  jobs.set(jobId, job);
  for (const [id, j] of jobs) if (Date.now() - Date.parse(j.startedAt) > 60 * 60_000 && j.status !== 'running') jobs.delete(id);

  void run(job, stored.req, stored.quote.estUsd, stored.quote.provider)
    .then(() => {
      job.status = 'done';
      job.progress = 'done';
    })
    .catch((err) => {
      job.status = 'failed';
      job.error = job.items.length ? `${errorMessage(err)} (${job.items.length} file(s) saved before the failure)` : errorMessage(err);
      console.error('[media job]', jobId, job.error);
    })
    .finally(() => {
      registry.inflight = null;
    });
  return { jobId };
}

async function save(
  job: JobState,
  p: { kind: MediaKind; provider: MediaProvider; model: string; prompt: string; params: Record<string, unknown>; ext: string; estUsd: number; write: (file: string) => Promise<void> },
): Promise<void> {
  const { id, file } = await allocOutput(p.kind, p.ext);
  try {
    await p.write(file);
    const st = await fs.stat(file);
    const rec: GenItemRecord = {
      id,
      kind: p.kind,
      provider: p.provider,
      model: p.model,
      prompt: p.prompt,
      params: p.params,
      file,
      bytes: st.size,
      mime: mimeForExt(p.ext),
      estUsd: round6(p.estUsd),
      created: new Date().toISOString(),
    };
    await appendManifest(rec);
    job.items.push(rec);
  } catch (err) {
    await fs.rm(file, { force: true });
    throw err;
  }
}

async function run(job: JobState, req: GenRequest, estUsd: number, provider: MediaProvider): Promise<void> {
  if (req.kind === 'image') return runImage(job, req, estUsd);
  if (req.kind === 'voice') return runVoice(job, req, estUsd);
  return runVideo(job, req, estUsd, provider);
}

async function runImage(job: JobState, r: ImageRequest, estUsd: number) {
  job.progress = `generating ${r.count} image${r.count > 1 ? 's' : ''}`;
  const imgs = await generateImages({ model: r.model, prompt: r.prompt, n: r.count, aspect: r.aspect, quality: r.quality, resolution: r.resolution });
  const each = estUsd / r.count;
  const params = { aspect: r.aspect, count: r.count, quality: r.quality, resolution: r.resolution };
  job.progress = 'saving to Windsor';
  for (const img of imgs) {
    const ext = sniffImageExt(img.data);
    await save(job, { kind: 'image', provider: 'xai', model: r.model, prompt: r.prompt, params, ext, estUsd: each, write: (f) => fs.writeFile(f, img.data) });
  }
}

async function runVoice(job: JobState, r: VoiceRequest, estUsd: number) {
  job.progress = 'synthesizing speech';
  const audio = await synthesize({ voiceId: r.voiceId, model: r.model, text: r.text, stability: r.stability, similarity: r.similarity });
  job.progress = 'saving to Windsor';
  await save(job, {
    kind: 'voice',
    provider: 'elevenlabs',
    model: r.model,
    prompt: r.text,
    params: { voiceId: r.voiceId, stability: r.stability, similarity: r.similarity, chars: r.text.length },
    ext: 'mp3',
    estUsd,
    write: (f) => fs.writeFile(f, audio),
  });
}

async function runVideo(job: JobState, r: VideoRequest, estUsd: number, provider: MediaProvider) {
  job.progress = `submitting ${r.count} video request${r.count > 1 ? 's' : ''}`;
  const ids: string[] = [];
  for (let i = 0; i < r.count; i++) {
    ids.push(await submitVideo({ model: r.model, prompt: r.prompt, duration: r.duration, aspect: r.aspect, resolution: r.resolution }));
  }
  const each = estUsd / r.count;
  const params = { aspect: r.aspect, duration: r.duration, resolution: r.resolution, count: r.count };
  const pending = new Set(ids);
  const started = Date.now();
  while (pending.size) {
    if (Date.now() - started > VIDEO_MAX_MS) {
      throw new MediaError(`Video still rendering after 15 min. xAI request id(s) (charged on completion): ${[...pending].join(', ')}`, 504);
    }
    await sleep(POLL_MS);
    job.progress = `rendering ${ids.length - pending.size}/${ids.length} done (${Math.round((Date.now() - started) / 1000)}s)`;
    for (const rid of [...pending]) {
      const res = await pollVideo(rid);
      if (res.status === 'pending') continue;
      pending.delete(rid);
      if (res.status === 'failed') throw new MediaError(`xAI video ${rid} failed: ${res.reason}`, 502);
      job.progress = 'downloading video';
      await save(job, { kind: 'video', provider, model: r.model, prompt: r.prompt, params: { ...params, requestId: rid }, ext: 'mp4', estUsd: each, write: (f) => downloadVideoTo(res.url, f) });
    }
  }
}
