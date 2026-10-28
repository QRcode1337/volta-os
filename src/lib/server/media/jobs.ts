import 'server-only';
import { HttpError } from '../http-error';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import type { GenItemRecord, GenRequest, ImageRequest, JobState, MediaKind, MediaProvider, Quote, ShotBatchRequest, VideoRequest, VoiceRequest } from '@/types/media';
import { assertWithinDailyCap } from './budget';
import { errorMessage } from './config';
import { getQuota, synthesize } from './elevenlabs';
import { registry, rateLimit } from './quotes';
import { allocOutput, appendManifest, mimeForExt, requireStorage, sniffImageExt } from './storage';
import { downloadVideoTo, generateImages, pollVideo, submitVideo } from './xai';
import { generateOmniVideoTo } from './gemini';
import { OMNI_MAX_SECONDS, OMNI_MODEL, OMNI_PRICES, VIDEO_PRICES } from './pricing';
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
  if (typeof quoteId !== 'string' || !/^q_[0-9a-f]{24}$/.test(quoteId)) throw new HttpError('quoteId is required (POST /api/media/quote first).', 400);
  if (registry.inflight) throw new HttpError('A generation is already running; wait for it to finish.', 429);
  const stored = registry.quotes.get(quoteId);
  if (!stored) throw new HttpError('Unknown quote. Request a new estimate.', 404);
  if (stored.used) throw new HttpError('This quote was already used. Request a new estimate.', 409);
  if (stored.expiresAt < Date.now()) throw new HttpError('Quote expired. Request a new estimate.', 410);

  const jobId = `j_${randomBytes(8).toString('hex')}`;
  registry.inflight = jobId; // sync, before any await
  try {
    rateLimit(registry.recentGenerates, 10, 60_000, 'generate');
    await requireStorage();
    // Re-checked here (not just at quote time): other jobs or the podcast may have spent since the quote.
    await assertWithinDailyCap(stored.quote.estUsd);
    if (stored.req.kind === 'voice') {
      const quota = await getQuota();
      if ((stored.credits ?? 0) > quota.remaining) throw new HttpError('Not enough ElevenLabs credits left for this request.', 422);
    }
    if (stored.used || stored.expiresAt < Date.now()) throw new HttpError('Quote no longer valid.', 409);
    stored.used = true; // consumed before spending
  } catch (err) {
    registry.inflight = null;
    throw err;
  }

  const job: JobState = { id: jobId, status: 'running', kind: stored.quote.kind, startedAt: new Date().toISOString(), progress: 'starting', items: [] };
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

async function run(job: JobState, req: GenRequest, estUsd: number, provider: Quote['provider']): Promise<void> {
  if (req.kind === 'image') return runImage(job, req, estUsd);
  if (req.kind === 'voice') return runVoice(job, req, estUsd);
  if (req.kind === 'shots') return runShots(job, req, estUsd);
  return runVideo(job, req, estUsd, provider as MediaProvider);
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
  if (provider === 'gemini') {
    const params = { aspect: r.aspect, resolution: r.resolution, count: r.count };
    for (let i = 0; i < r.count; i++) {
      job.progress = `Omni rendering clip ${i + 1}/${r.count}`;
      await saveOmni(job, { prompt: r.prompt, aspect: r.aspect, resolution: r.resolution, params, estUsd: estUsd / r.count });
    }
    return;
  }
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
      throw new HttpError(`Video still rendering after 15 min. xAI request id(s) (charged on completion): ${[...pending].join(', ')}`, 504);
    }
    await sleep(POLL_MS);
    job.progress = `rendering ${ids.length - pending.size}/${ids.length} done (${Math.round((Date.now() - started) / 1000)}s)`;
    for (const rid of [...pending]) {
      const res = await pollVideo(rid);
      if (res.status === 'pending') continue;
      pending.delete(rid);
      if (res.status === 'failed') throw new HttpError(`xAI video ${rid} failed: ${res.reason}`, 502);
      job.progress = 'downloading video';
      await save(job, { kind: 'video', provider, model: r.model, prompt: r.prompt, params: { ...params, requestId: rid }, ext: 'mp4', estUsd: each, write: (f) => downloadVideoTo(res.url, f) });
    }
  }
}

/** One Omni clip → Windsor. The interaction id is kept so a later edit/extend can continue from it. */
async function saveOmni(job: JobState, p: { prompt: string; aspect: string; resolution: string; params: Record<string, unknown>; estUsd: number }) {
  let interactionId = '';
  await save(job, {
    kind: 'video',
    provider: 'gemini',
    model: OMNI_MODEL,
    prompt: p.prompt,
    params: p.params,
    ext: 'mp4',
    estUsd: p.estUsd,
    write: async (f) => {
      interactionId = await generateOmniVideoTo({ prompt: p.prompt, aspect: p.aspect, resolution: p.resolution }, f);
    },
  });
  const rec = job.items[job.items.length - 1];
  if (rec && interactionId) rec.params = { ...rec.params, interactionId };
}

/**
 * Shot-list batch: every xAI shot is submitted up front and polled together; Omni shots render one at a time
 * meanwhile. A failed shot doesn't stop the others; the job fails at the end listing which shots failed.
 */
async function runShots(job: JobState, r: ShotBatchRequest, estUsd: number) {
  const total = r.items.length;
  // Each shot's recorded est = its own model's price x the seconds it was quoted at, scaled to the quoted total.
  const priceOf = (it: ShotBatchRequest['items'][number]) =>
    it.model === OMNI_MODEL ? (OMNI_PRICES[it.resolution] ?? 0) * OMNI_MAX_SECONDS : (VIDEO_PRICES[it.model]?.[it.resolution] ?? 0) * it.duration;
  const quotedTotal = r.items.reduce((a, it) => a + priceOf(it), 0);
  const shareOf = (it: ShotBatchRequest['items'][number]) => (quotedTotal > 0 ? (estUsd * priceOf(it)) / quotedTotal : estUsd / total);
  const failures: string[] = [];
  let done = 0;
  const tick = (what: string) => {
    job.progress = `${done}/${total} shots done · ${what}`;
  };
  const paramsOf = (it: ShotBatchRequest['items'][number]) => ({ shotId: it.shotId, tier: it.tier, aspect: r.aspect, resolution: it.resolution, duration: it.duration });

  const xaiShots = r.items.filter((it) => it.model !== OMNI_MODEL);
  const omniShots = r.items.filter((it) => it.model === OMNI_MODEL);

  // Submit xAI shots first so they render while Omni works.
  const pending = new Map<string, ShotBatchRequest['items'][number]>();
  for (const it of xaiShots) {
    tick(`submitting ${it.shotId}`);
    try {
      pending.set(await submitVideo({ model: it.model, prompt: it.prompt, duration: it.duration, aspect: r.aspect, resolution: it.resolution }), it);
    } catch (err) {
      failures.push(`${it.shotId}: ${errorMessage(err)}`);
    }
  }

  const pollXai = async () => {
    const started = Date.now();
    while (pending.size) {
      if (Date.now() - started > VIDEO_MAX_MS) {
        for (const [rid, it] of pending) failures.push(`${it.shotId}: still rendering after 15 min (xAI request ${rid}, charged on completion)`);
        pending.clear();
        return;
      }
      await sleep(POLL_MS);
      for (const [rid, it] of [...pending]) {
        try {
          const res = await pollVideo(rid);
          if (res.status === 'pending') continue;
          pending.delete(rid);
          if (res.status === 'failed') {
            failures.push(`${it.shotId}: xAI failed (${res.reason})`);
            continue;
          }
          await save(job, { kind: 'video', provider: 'xai', model: it.model, prompt: it.prompt, params: { ...paramsOf(it), requestId: rid }, ext: 'mp4', estUsd: shareOf(it), write: (f) => downloadVideoTo(res.url, f) });
          done++;
          tick('rendering');
        } catch (err) {
          pending.delete(rid);
          failures.push(`${it.shotId}: ${errorMessage(err)}`);
        }
      }
    }
  };

  const runOmni = async () => {
    for (const it of omniShots) {
      tick(`Omni rendering ${it.shotId}`);
      try {
        await saveOmni(job, { prompt: it.prompt, aspect: r.aspect, resolution: it.resolution, params: paramsOf(it), estUsd: shareOf(it) });
        done++;
      } catch (err) {
        failures.push(`${it.shotId}: ${errorMessage(err)}`);
      }
    }
  };

  await Promise.all([pollXai(), runOmni()]);
  job.progress = `${done}/${total} shots done`;
  if (failures.length) throw new HttpError(`${failures.length} of ${total} shot(s) failed: ${failures.join(' | ')}`, 502);
}
