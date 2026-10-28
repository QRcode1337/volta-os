import 'server-only';
import { HttpError } from '../http-error';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CostEstimate, PodcastConfig } from './types';
import type { Turn } from './script';
import { FFMPEG, FFPROBE, geminiKey } from './config';
import { errMsg, maskSecrets, round, sleep } from './util';

// Stage 4: Gemini multi-speaker text-to-speech (generateContent, two prebuilt voices), then ffmpeg joins the chunks
// into one loudness-normalised mp3. ElevenLabs is deliberately not used.
//
// Limits (checked against the live model list, Oct 2026): TTS models take <= 8,192 input tokens and emit <= 16,384
// output tokens per request; audio is 25 tokens/s on the 3.x models (32/s on 2.5), so one request can carry at most
// ~10 minutes of speech. We chunk by turn at ~2,400 characters (~2.5 minutes) so a bad chunk is cheap to redo.

interface Rate {
  inPerM: number;
  outPerM: number;
  tokPerSec: number;
}
/** USD per 1M tokens (paid tier). The 3.8 models double on 2027-01-01. */
export function rateFor(model: string, date: string): Rate {
  const late = date >= '2027-01-01';
  switch (model) {
    case 'gemini-3.8-flash-tts':
      return late ? { inPerM: 1, outPerM: 18, tokPerSec: 25 } : { inPerM: 0.5, outPerM: 9, tokPerSec: 25 };
    case 'gemini-3.8-flash-lite-tts':
      return late ? { inPerM: 1, outPerM: 12, tokPerSec: 25 } : { inPerM: 0.5, outPerM: 6, tokPerSec: 25 };
    case 'gemini-3.1-flash-tts-preview':
      return { inPerM: 1, outPerM: 20, tokPerSec: 25 };
    case 'gemini-2.5-flash-preview-tts':
      return { inPerM: 0.5, outPerM: 10, tokPerSec: 32 };
    case 'gemini-2.5-pro-preview-tts':
      return { inPerM: 1, outPerM: 20, tokPerSec: 32 };
    default:
      return { inPerM: 1, outPerM: 20, tokPerSec: 32 }; // unknown model: price pessimistically
  }
}

/** Spoken words per second of generated audio (calibrated on real output; refine as episodes accumulate). */
const WORDS_PER_SEC = 2.5; // measured: 2,168 words -> 878 s (2.47 w/s) on the first real episode

export function costOf(model: string, date: string, inTok: number, audioTok: number): number {
  const r = rateFor(model, date);
  return (inTok * r.inPerM + audioTok * r.outPerM) / 1e6;
}

export function estimate(cfg: PodcastConfig, date: string): CostEstimate {
  const f = (words: number) => {
    const sec = words / WORDS_PER_SEC;
    const r = rateFor(cfg.tts.model, date);
    const audioTok = sec * r.tokPerSec;
    const inTok = (words * 6.2) / 4 + Math.ceil((words * 6.2) / cfg.tts.chunkChars) * 60;
    return { sec, usd: costOf(cfg.tts.model, date, inTok, audioTok), audioTok, inTok };
  };
  const typ = f(cfg.script.targetWords);
  const max = f(cfg.script.maxWords);
  return {
    usd: round(typ.usd, 3),
    maxUsd: round(max.usd, 3),
    audioMinutes: round(typ.sec / 60, 1),
    model: cfg.tts.model,
    breakdown: `~${Math.round(typ.sec / 60)} min of speech = ~${Math.round(typ.audioTok).toLocaleString()} audio tokens at $${rateFor(cfg.tts.model, date).outPerM}/M + ~${Math.round(typ.inTok).toLocaleString()} text tokens at $${rateFor(cfg.tts.model, date).inPerM}/M. Claude steps run on the Max plan (not billed).`,
    needsConfirm: max.usd > cfg.cost.confirmAboveUsd,
    confirmAboveUsd: cfg.cost.confirmAboveUsd,
  };
}

export function estimateForWords(cfg: PodcastConfig, date: string, words: number): number {
  const r = rateFor(cfg.tts.model, date);
  const sec = words / WORDS_PER_SEC;
  const inTok = (words * 6.2) / 4 + Math.ceil((words * 6.2) / cfg.tts.chunkChars) * 60;
  return costOf(cfg.tts.model, date, inTok, sec * r.tokPerSec);
}

// ───────────── chunking ─────────────

export function chunkTurns(turns: Turn[], maxChars: number): Turn[][] {
  const pieces: Turn[] = [];
  for (const t of turns) {
    if (t.text.length <= maxChars) {
      pieces.push(t);
      continue;
    }
    let buf = '';
    for (const s of t.text.split(/(?<=[.!?])\s+/)) {
      if (buf && buf.length + s.length + 1 > maxChars) {
        pieces.push({ ...t, text: buf });
        buf = s;
      } else buf = buf ? `${buf} ${s}` : s;
    }
    if (buf) pieces.push({ ...t, text: buf });
  }
  const chunks: Turn[][] = [];
  let cur: Turn[] = [];
  let len = 0;
  for (const p of pieces) {
    if (cur.length && len + p.text.length > maxChars) {
      chunks.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(p);
    len += p.text.length + 8;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

// ───────────── Gemini (Interactions API) ─────────────
// The 3.x TTS models take multi-speaker input as one text item per turn, each annotated with speech_metadata.speaker
// (plain generateContent with a single "Name: text" block is rejected with 400). Verified live, Oct 2026.

const API = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const SAMPLE_RATE = 24_000;
const STYLE = 'Warm, energetic and curious, like two expert friends talking naturally';

interface InteractionResp {
  status?: string;
  steps?: { type?: string; content?: { type?: string; data?: string; mime_type?: string }[] }[];
  usage?: { total_input_tokens?: number; total_output_tokens?: number };
  error?: { message?: string; code?: string };
}

async function synthChunk(cfg: PodcastConfig, chunk: Turn[], expectedSec: number, label: string): Promise<{ pcm: Buffer; inTok: number; outTok: number }> {
  const key = geminiKey();
  if (!key) throw new HttpError('GEMINI_API_KEY is not set in .env.local (restart the dev server after adding it).', 503);
  if (!cfg.tts.model.startsWith('gemini-3')) throw new HttpError(`tts.model "${cfg.tts.model}" is not supported: use a gemini-3.x TTS model (Interactions API).`, 400);
  const body = {
    model: cfg.tts.model,
    input: [
      {
        type: 'user_input',
        content: chunk.map((t) => ({ type: 'text', text: t.text, annotations: [{ type: 'speech_metadata', speaker: cfg.hosts[t.speaker].name, style: STYLE }] })),
      },
    ],
    response_format: { type: 'audio', mime_type: 'audio/l16', sample_rate: SAMPLE_RATE },
    generation_config: { speech_config: { speakers: cfg.hosts.map((h) => ({ speaker: h.name, voice: h.voice })) } },
  };
  let lastErr = 'unknown error';
  for (let attempt = 1; attempt <= 4; attempt++) {
    let res: Response;
    try {
      res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(cfg.tts.timeoutSec * 1000),
      });
    } catch (e) {
      lastErr = `network: ${errMsg(e)}`;
      await sleep(2000 * attempt);
      continue;
    }
    const raw = await res.text();
    let j: InteractionResp = {};
    try {
      j = JSON.parse(raw) as InteractionResp;
    } catch {
      // non-JSON body
    }
    if (!res.ok) {
      lastErr = `HTTP ${res.status}: ${maskSecrets(j.error?.message ?? raw.slice(0, 200))}`;
      if (res.status === 429) {
        const wait = Number(res.headers.get('retry-after')) || 20 * attempt;
        await sleep(Math.min(90, wait) * 1000);
        continue;
      }
      if (res.status >= 500) {
        await sleep(3000 * attempt);
        continue;
      }
      throw new HttpError(`Gemini TTS rejected ${label}: ${lastErr}`, 502); // 400/401/403/404: retrying cannot help
    }
    const audio = (j.steps ?? []).flatMap((s) => s.content ?? []).filter((c) => c.type === 'audio' && c.data).pop();
    if (!audio?.data) {
      lastErr = `no audio in reply (status ${j.status ?? 'unknown'})`;
      await sleep(1500 * attempt);
      continue;
    }
    let pcm: Buffer = Buffer.from(audio.data, 'base64');
    if (pcm.subarray(0, 4).toString() === 'RIFF') {
      const at = pcm.indexOf('data');
      pcm = pcm.subarray(at >= 0 ? at + 8 : 44); // WAV fallback: drop the header
    }
    const sec = pcm.length / (SAMPLE_RATE * 2);
    if (sec < expectedSec * 0.5 || sec > expectedSec * 2.5) {
      lastErr = `audio length ${sec.toFixed(0)}s is implausible for ~${expectedSec.toFixed(0)}s of text`;
      continue;
    }
    const outTok = j.usage?.total_output_tokens ?? Math.round(sec * rateFor(cfg.tts.model, '2026-01-01').tokPerSec);
    return { pcm, inTok: j.usage?.total_input_tokens ?? 0, outTok };
  }
  throw new HttpError(`Gemini TTS failed for ${label} after retries: ${lastErr}`, 502);
}

function wav(pcm: Buffer): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(SAMPLE_RATE, 24);
  h.writeUInt32LE(SAMPLE_RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export interface SynthResult {
  workDir: string;
  chunkFiles: string[];
  gapFile: string;
  inTokens: number;
  audioTokens: number;
  usd: number;
  audioSec: number;
}

/** Render every chunk to WAV files in `workDir` (on Windsor). Sequential: stays within free-tier rate limits. */
export async function synthesize(cfg: PodcastConfig, turns: Turn[], date: string, workDir: string, capUsd: number, onDetail: (s: string) => void): Promise<SynthResult> {
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(workDir, { recursive: true });
  const chunks = chunkTurns(turns, cfg.tts.chunkChars);
  const files: string[] = [];
  let inTok = 0;
  let outTok = 0;
  let sec = 0;
  for (let i = 0; i < chunks.length; i++) {
    const words = chunks[i].reduce((a, t) => a + (t.text.match(/\S+/g)?.length ?? 0), 0);
    onDetail(`speaking chunk ${i + 1}/${chunks.length} (${words} words)`);
    const r = await synthChunk(cfg, chunks[i], words / WORDS_PER_SEC, `chunk ${i + 1}/${chunks.length}`);
    inTok += r.inTok;
    outTok += r.outTok;
    sec += r.pcm.length / (SAMPLE_RATE * 2);
    const spent = costOf(cfg.tts.model, date, inTok, outTok);
    const file = path.join(workDir, `c${String(i).padStart(3, '0')}.wav`);
    await fs.writeFile(file, wav(r.pcm));
    files.push(file);
    if (spent > capUsd) throw new HttpError(`Stopped: TTS spend $${spent.toFixed(3)} exceeded the $${capUsd.toFixed(2)} cap after ${i + 1}/${chunks.length} chunks.`, 402);
  }
  const gapFile = path.join(workDir, 'gap.wav');
  await fs.writeFile(gapFile, wav(Buffer.alloc(Math.round((SAMPLE_RATE * 2 * cfg.tts.gapMs) / 1000))));
  return { workDir, chunkFiles: files, gapFile, inTokens: inTok, audioTokens: outTok, usd: costOf(cfg.tts.model, date, inTok, outTok), audioSec: sec };
}

// ───────────── ffmpeg ─────────────

function run(bin: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${path.basename(bin)} failed: ${maskSecrets((stderr || err.message).trim().split('\n').slice(-4).join(' | '))}`));
      else resolve({ stdout, stderr });
    });
  });
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await fs.access(FFMPEG);
    return true;
  } catch {
    return false;
  }
}

/** Join the chunks (with short gaps) and two-pass loudnorm to the target LUFS; returns the mp3 path inside `workDir`. */
export async function assemble(cfg: PodcastConfig, synth: SynthResult, meta: { title: string; date: string }): Promise<{ file: string; durationSec: number }> {
  const list = path.join(synth.workDir, 'concat.txt');
  const lines = synth.chunkFiles.flatMap((f, i) => (i === 0 ? [`file '${path.basename(f)}'`] : [`file '${path.basename(synth.gapFile)}'`, `file '${path.basename(f)}'`]));
  await fs.writeFile(list, `${lines.join('\n')}\n`);
  const target = `I=${cfg.audio.lufs}:TP=-1.5:LRA=11`;
  const base = ['-hide_banner', '-nostats', '-y', '-f', 'concat', '-safe', '0', '-i', list];
  // pass 1: measure
  const p1 = await run(FFMPEG, [...base, '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-'], 300_000);
  const mj = p1.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/)?.[0];
  if (!mj) throw new Error('ffmpeg loudnorm measurement produced no stats');
  const m = JSON.parse(mj) as Record<string, string>;
  // pass 2: linear normalisation with the measured values, then mp3
  const out = path.join(synth.workDir, 'episode.mp3');
  const norm = `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  await run(
    FFMPEG,
    [
      ...base,
      '-af',
      `${norm},aresample=44100`,
      '-ac', '1',
      '-c:a', 'libmp3lame',
      '-b:a', `${cfg.audio.bitrateKbps}k`,
      '-id3v2_version', '3',
      '-metadata', `title=${meta.title}`,
      '-metadata', `artist=${cfg.author}`,
      '-metadata', `album=${cfg.title}`,
      '-metadata', `date=${meta.date}`,
      '-metadata', 'genre=Podcast',
      '-f', 'mp3',
      out,
    ],
    300_000,
  );
  const probe = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], 30_000);
  const durationSec = parseFloat(probe.stdout.trim());
  if (!Number.isFinite(durationSec) || durationSec < 60) throw new Error(`Assembled audio is only ${probe.stdout.trim()}s: refusing to publish it`);
  return { file: out, durationSec: Math.round(durationSec) };
}
