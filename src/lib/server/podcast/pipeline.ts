import 'server-only';
import { HttpError } from '../http-error';
import { BIN } from '../proc';
import { randomBytes } from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CostBreakdown, EpisodeRecord, JobState, PodcastConfig, Stage, StageTiming, Story } from './types';
import { assertWithinDailyCap } from '../media/budget';
import { PODCAST_ROOT, geminiKey, loadConfig } from './config';
import { gatherFixedSources } from './gather';
import { claudeBin } from '../claude';
import { buildNotes } from './notes';
import { rankAndSelect } from './rank';
import { researchTopics, researchWarnings, runResearch, summarizeResearch, type ResearchOutcome } from './research';
import { writeScript, writeTitle } from './script';
import { writeAtomic } from '../storage';
import { getEpisode, paths, pruneOld, requireStorage, upsertEpisode } from './storage';
import { assemble, estimate, estimateForWords, ffmpegAvailable, synthesize } from './tts';
import { errMsg, isDate, localDate, round } from './util';

// Orchestrates one episode: gather -> research -> rank -> script -> tts -> assemble -> store. One job at a time,
// state lives on globalThis (survives hot reload) and is polled by the app and by scripts/podcast-run.mjs.

const g = globalThis as unknown as { __podcastJob?: JobState | null };

const JOB_FILE = path.join(PODCAST_ROOT, '.job.json');

/** Best-effort snapshot so a dev-server restart mid-run shows up as "interrupted" instead of silently vanishing. */
function persist(job: JobState): void {
  writeAtomic(JOB_FILE, JSON.stringify(job)).catch(() => {});
}

export function currentJob(): JobState | null {
  if (g.__podcastJob !== undefined) return g.__podcastJob;
  try {
    const j = JSON.parse(fsSync.readFileSync(JOB_FILE, 'utf8')) as JobState;
    if (j.status === 'running') {
      // The process that owned this job is gone (restart / hot reload of the server).
      j.status = 'failed';
      j.error = 'Interrupted: the server restarted while the episode was being generated. Research already finished is cached; run it again.';
      j.endedAt = new Date().toISOString();
    }
    g.__podcastJob = j;
  } catch {
    g.__podcastJob = null;
  }
  return g.__podcastJob;
}

export interface StartOptions {
  date?: string;
  /** Replace an existing episode for that date. */
  force?: boolean;
  /** Re-run web research even if today's research cache exists. */
  freshResearch?: boolean;
  /** The USD figure the user confirmed in the UI (required when the max estimate exceeds cost.confirmAboveUsd). */
  confirmUsd?: number;
  trigger: 'manual' | 'scheduled';
}

export async function startGeneration(opts: StartOptions): Promise<JobState> {
  const cfg = loadConfig();
  const date = opts.date ?? localDate();
  if (!isDate(date)) throw new HttpError('`date` must be YYYY-MM-DD.', 400);
  if (currentJob()?.status === 'running') throw new HttpError('An episode is already being generated.', 409);

  await requireStorage(); // 507 if Windsor is missing or below the shared free-space floor
  if (!geminiKey()) throw new HttpError('GEMINI_API_KEY is missing from .env.local (then restart the dev server).', 503);
  if (!(await ffmpegAvailable())) throw new HttpError(`ffmpeg not found at ${BIN.ffmpeg} (install it with Homebrew or set VOLTA_FFMPEG).`, 503);
  if (!opts.force && (await getEpisode(date))) throw new HttpError(`An episode for ${date} already exists. Use regenerate to replace it.`, 409);

  const est = estimate(cfg, date);
  if (est.maxUsd > cfg.cost.hardCapUsd) throw new HttpError(`Estimated cost $${est.maxUsd.toFixed(2)} exceeds the hard cap $${cfg.cost.hardCapUsd.toFixed(2)}.`, 422);
  if (opts.trigger === 'manual' && est.needsConfirm && !(typeof opts.confirmUsd === 'number' && opts.confirmUsd + 1e-9 >= est.maxUsd)) {
    throw new HttpError(`Estimated cost up to $${est.maxUsd.toFixed(2)} is above $${cfg.cost.confirmAboveUsd.toFixed(2)}: confirm it first.`, 402);
  }
  await assertWithinDailyCap(est.maxUsd); // the shared VOLTA daily cap (VOLTA_GEN_DAILY_USD) counts podcast TTS, so it gates scheduled runs too

  const job: JobState = {
    id: `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`,
    date,
    status: 'running',
    trigger: opts.trigger,
    stage: null,
    detail: 'starting',
    startedAt: new Date().toISOString(),
    endedAt: null,
    timings: [],
    warnings: [],
    error: null,
    estUsd: est.usd,
    episode: null,
  };
  g.__podcastJob = job;
  persist(job);
  void run(job, cfg, opts).catch((e) => {
    job.status = 'failed';
    job.error = errMsg(e);
    job.endedAt = new Date().toISOString();
    persist(job);
    console.error('[podcast] generation failed:', job.error);
  });
  return job;
}

async function run(job: JobState, cfg: PodcastConfig, opts: StartOptions): Promise<void> {
  const date = job.date;
  const p = paths(date);
  let timing: StageTiming | null = null;
  const begin = (stage: Stage, detail: string) => {
    end();
    timing = { stage, startedAt: new Date().toISOString(), endedAt: null, ms: null };
    job.timings.push(timing);
    job.stage = stage;
    job.detail = detail;
    persist(job);
  };
  const end = (note?: string) => {
    if (!timing) return;
    timing.endedAt = new Date().toISOString();
    timing.ms = Date.parse(timing.endedAt) - Date.parse(timing.startedAt);
    if (note) timing.note = note;
    timing = null;
    persist(job);
  };
  const detail = (s: string) => {
    job.detail = s;
  };
  const warn = (s: string) => {
    if (!job.warnings.includes(s)) job.warnings.push(s);
  };

  try {
    // 1. gather the fixed sources
    begin('gather', 'reading Notion, arXiv, RSS and Feeds');
    const fixed = await gatherFixedSources(cfg, detail);
    fixed.notices.forEach(warn);
    end(`notion ${fixed.counts.notion}, arxiv ${fixed.counts.arxiv}, rss ${fixed.counts.rss}, feeds ${fixed.counts.feeds}`);

    // 2. deep research (claude -p + web tools), cached per day
    begin('research', 'starting web research');
    let research: ResearchOutcome = { candidates: [], results: [], wallMs: 0, callMs: 0, listCostUsd: 0 };
    const skipped = claudeBin() ? undefined : 'the claude CLI was not found; set VOLTA_CLAUDE_BIN';
    if (!skipped) research = await runResearch(cfg, date, { fresh: !!opts.freshResearch }, detail);
    // Degraded research does not stop the run: the episode still ships (the feed has no draft state and the 06:00 run is
    // unattended), but it is flagged everywhere it is seen: the headline warning, the episode record, show notes and the RSS item.
    const researchSummary = summarizeResearch(research, researchTopics(cfg).length, skipped);
    job.research = researchSummary;
    const rw = researchWarnings(researchSummary, (id) => cfg.topics.find((t) => t.id === id)?.label ?? id);
    if (rw.headline) job.warnings.unshift(rw.headline);
    rw.details.forEach(warn);
    if (skipped && !rw.headline) warn(`Research skipped: ${skipped}.`);
    end(`${research.candidates.length} stories from ${researchSummary.succeeded}/${researchSummary.attempted} topics${researchSummary.degraded ? ` (DEGRADED: at least ${researchSummary.minOk} expected)` : ''}, ${Math.round(research.wallMs / 1000)}s wall`);

    // 3. dedupe + rank + pick 6-10
    begin('rank', 'de-duplicating and ranking');
    const all = [...research.candidates, ...fixed.candidates];
    const ranked = await rankAndSelect(all, cfg, detail);
    if (ranked.stories.length < 3) throw new HttpError(`Only ${ranked.stories.length} usable stories found (pool ${ranked.poolSize}); refusing to make a thin episode.`, 422);
    end(`${ranked.stories.length} picked from ${ranked.poolSize}${ranked.jevUsed ? ' (JEV)' : ''}`);

    // 4. script
    begin('script', 'writing the script');
    const script = await writeScript(ranked.stories, cfg, date, detail);
    script.warnings.forEach(warn);
    detail('naming the episode');
    const meta = await writeTitle(ranked.stories, cfg, date);
    const scriptCost = estimateForWords(cfg, date, script.words);
    if (opts.trigger === 'manual' && scriptCost > cfg.cost.confirmAboveUsd && !(typeof opts.confirmUsd === 'number' && opts.confirmUsd >= scriptCost)) {
      throw new HttpError(`The script came out longer than estimated (cost $${scriptCost.toFixed(2)}, above the confirmed amount). Nothing was spent on audio; run again and confirm.`, 402);
    }
    if (scriptCost > cfg.cost.hardCapUsd) throw new HttpError(`Audio would cost about $${scriptCost.toFixed(2)}, above the hard cap $${cfg.cost.hardCapUsd.toFixed(2)}.`, 422);
    await assertWithinDailyCap(scriptCost);
    end(`${script.words} words via ${script.backend}`);

    // 5. text to speech
    begin('tts', 'preparing audio');
    await requireStorage();
    const synth = await synthesize(cfg, script.turns, date, p.workDir, cfg.cost.hardCapUsd, detail);
    end(`${Math.round(synth.audioSec)}s of speech, $${synth.usd.toFixed(3)}`);

    // 6. ffmpeg join + loudness normalise
    begin('assemble', 'joining chunks and normalising loudness (ffmpeg)');
    const audio = await assemble(cfg, synth, { title: meta.title, date });
    end(`${audio.durationSec}s mp3`);

    // 7. store: mp3 + notes + script + manifest on Windsor
    begin('store', 'writing files to Windsor');
    await requireStorage();
    const cost: CostBreakdown = {
      ttsUsd: round(synth.usd, 4),
      ttsInputTokens: synth.inTokens,
      ttsAudioTokens: synth.audioTokens,
      claudeListUsd: round(research.listCostUsd + script.listCostUsd + meta.listCostUsd, 4),
    };
    const stories: Story[] = ranked.stories;
    const info = [
      `Research: ${researchSummary.succeeded}/${researchSummary.attempted} topics researched on the web (${Math.round(research.wallMs / 1000)} s), merged with ${fixed.counts.notion} Notion, ${fixed.counts.arxiv} arXiv, ${fixed.counts.rss} RSS and ${fixed.counts.feeds} Feeds items; ${ranked.poolSize} unique candidates, ${stories.length} chosen${ranked.jevUsed ? ' with JEV ranking' : ''}.`,
      `Script: ${script.words} words by ${script.backend}. Audio: ${cfg.tts.model}, voices ${cfg.hosts.map((h) => `${h.name}=${h.voice}`).join(', ')}.`,
      `Cost: Gemini TTS $${cost.ttsUsd.toFixed(3)} (${cost.ttsAudioTokens.toLocaleString()} audio tokens). Claude steps ran on the Max plan (list-price equivalent $${cost.claudeListUsd.toFixed(2)}, not billed).`,
    ];
    const notes = buildNotes({ cfg, date, title: meta.title, description: meta.description, durationSec: audio.durationSec, stories, runnersUp: ranked.runnersUp, notices: job.warnings, info, research: researchSummary });
    await fs.mkdir(PODCAST_ROOT, { recursive: true });
    await writeAtomic(p.notes, notes);
    await writeAtomic(p.script, `${script.raw}\n`);
    await fs.rename(audio.file, p.mp3);
    const st = await fs.stat(p.mp3);
    end('mp3 + notes + script + manifest');
    const episode: EpisodeRecord = {
      date,
      title: meta.title,
      description: meta.description,
      file: p.mp3,
      notesFile: p.notes,
      scriptFile: p.script,
      bytes: st.size,
      durationSec: audio.durationSec,
      words: script.words,
      createdAt: new Date().toISOString(),
      stories,
      topicsCovered: [...new Set(stories.map((s) => s.topic))],
      scriptBackend: script.backend,
      ttsModel: cfg.tts.model,
      cost,
      timings: job.timings.map((t) => ({ ...t })),
      researchMs: research.wallMs,
      jevUsed: ranked.jevUsed,
      warnings: [...job.warnings],
      research: researchSummary,
    };
    await upsertEpisode(episode);
    await fs.rm(p.workDir, { recursive: true, force: true }).catch(() => {});
    await pruneOld().catch(() => {});
    job.episode = episode;
    job.status = 'done';
    job.stage = null;
    job.detail = 'done';
    job.endedAt = new Date().toISOString();
    persist(job);
  } catch (e) {
    end('failed');
    await fs.rm(p.workDir, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}
