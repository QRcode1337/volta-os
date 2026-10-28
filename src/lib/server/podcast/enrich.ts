import 'server-only';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PODCAST_ROOT } from './config';
import { llm } from './llm';
import { clip, errMsg } from './util';
import { writeAtomic } from '../storage';
import type { EpisodeRecord } from './types';

// Background transcript + one-paragraph summary for muse.ai episodes (the feed carries only title, description and audio).
// Audio is downloaded to a temp dir, transcribed locally with whisper.cpp (no API cost), then summarised through the `quick`
// LLM task. Results are small text files on the boot disk so they stay readable when Windsor is unplugged; only the 466 MB
// model lives on Windsor. One episode at a time, newest first; failures are remembered in memory and retried on restart.

const WHISPER = '/opt/homebrew/bin/whisper-cli';
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const MODEL = path.join(PODCAST_ROOT, 'models', 'ggml-small.en.bin');
const CACHE_ROOT = path.join(os.homedir(), 'Library', 'Application Support', 'VOLTA', 'podcast', 'external');

export interface Enrichment {
  transcript: string;
  summary: string;
  status: 'ready' | 'queued' | 'running' | 'failed' | 'unavailable';
  error?: string;
}

interface Meta {
  audioKey: string;
}

const dir = (date: string) => path.join(CACHE_ROOT, date);
const audioKey = (ep: EpisodeRecord) => path.basename(new URL(ep.audioUrl!).pathname);
const read = (f: string) => fs.promises.readFile(f, 'utf8').catch(() => '');

const live = new Map<string, { status: 'queued' | 'running' | 'failed'; error?: string }>();
const queue: EpisodeRecord[] = [];
let working = false;

async function isCurrent(ep: EpisodeRecord): Promise<boolean> {
  const meta = await read(path.join(dir(ep.date), 'meta.json'));
  try {
    return (JSON.parse(meta) as Meta).audioKey === audioKey(ep) && (await read(path.join(dir(ep.date), 'summary.txt'))).length > 0;
  } catch {
    return false;
  }
}

/** What is cached for this episode right now, plus the live state of its background job. */
export async function getEnrichment(ep: EpisodeRecord): Promise<Enrichment> {
  if (await isCurrent(ep)) {
    return { transcript: await read(path.join(dir(ep.date), 'transcript.txt')), summary: await read(path.join(dir(ep.date), 'summary.txt')), status: 'ready' };
  }
  const l = live.get(ep.date);
  return { transcript: '', summary: '', status: l?.status ?? 'unavailable', error: l?.error };
}

const run = (file: string, args: string[], timeoutMs: number) =>
  new Promise<void>((resolve, reject) => {
    execFile(file, args, { timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024 }, (err, _o, stderr) => (err ? reject(new Error(clip((stderr || err.message).trim().split('\n').slice(-3).join(' '), 300))) : resolve()));
  });

async function transcribe(ep: EpisodeRecord): Promise<void> {
  if (!fs.existsSync(MODEL)) throw new Error('Whisper model not found (is the Windsor drive mounted?)');
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'volta-pod-'));
  try {
    const res = await fetch(ep.audioUrl!, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`audio download failed (HTTP ${res.status})`);
    await fs.promises.writeFile(path.join(tmp, 'a.mp3'), Buffer.from(await res.arrayBuffer()));
    await run(FFMPEG, ['-loglevel', 'error', '-y', '-i', path.join(tmp, 'a.mp3'), '-ar', '16000', '-ac', '1', path.join(tmp, 'a.wav')], 120_000);
    await run(WHISPER, ['-m', MODEL, '-f', path.join(tmp, 'a.wav'), '-t', '4', '-nt', '-otxt', '-of', path.join(tmp, 'out')], 30 * 60_000);
    const transcript = (await read(path.join(tmp, 'out.txt'))).replace(/[ \t]+\n/g, '\n').trim();
    if (transcript.split(/\s+/).length < 50) throw new Error('transcript came back nearly empty');
    const r = await llm({
      task: 'quick',
      label: `summary ${ep.date}`,
      system: 'You write one-paragraph outlines of podcast episodes. Plain prose, no markdown, no preamble.',
      prompt: `Episode: ${ep.title}\n\nWrite ONE paragraph (90-140 words) outlining this episode: the main stories in the order covered and the key takeaway of each. State claims as the hosts state them; do not add facts.\n\nTranscript:\n${clip(transcript, 24_000)}`,
      timeoutMs: 120_000,
    });
    const d = dir(ep.date);
    await writeAtomic(path.join(d, 'transcript.txt'), transcript);
    await writeAtomic(path.join(d, 'summary.txt'), r.text.trim());
    await writeAtomic(path.join(d, 'meta.json'), JSON.stringify({ audioKey: audioKey(ep) } satisfies Meta));
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

async function drain(): Promise<void> {
  if (working) return;
  working = true;
  try {
    for (let ep = queue.shift(); ep; ep = queue.shift()) {
      live.set(ep.date, { status: 'running' });
      try {
        await transcribe(ep);
        live.delete(ep.date);
      } catch (e) {
        live.set(ep.date, { status: 'failed', error: errMsg(e) });
      }
    }
  } finally {
    working = false;
  }
}

/** Queue every episode that has no current transcript (newest first). Fire-and-forget; safe to call on every feed refresh. */
export async function enqueueMissing(episodes: EpisodeRecord[]): Promise<void> {
  for (const ep of episodes) {
    if (!ep.audioUrl || live.has(ep.date) || (await isCurrent(ep))) continue;
    live.set(ep.date, { status: 'queued' });
    queue.push(ep);
  }
  void drain();
}
