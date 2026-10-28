import 'server-only';
import { HttpError } from '../http-error';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WINDSOR_VOLTA, writeAtomicSync } from '../storage';
import type { PodcastConfig, TopicConfig } from './types';

// config/podcast.json is the single source of truth (topic weights are edited from the app and written back).
// Everything bulky lives on the Windsor drive: nothing is ever written to the boot disk except the small config.

export const CONFIG_PATH = path.join(process.cwd(), 'config', 'podcast.json');
export const PODCAST_ROOT = path.join(WINDSOR_VOLTA, 'podcast');
export const LLM_CWD = path.join(os.tmpdir(), 'volta-podcast-llm');

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function normalize(raw: PodcastConfig): PodcastConfig {
  const cfg = { ...raw };
  cfg.topics = raw.topics.map((t) => ({ ...t, weight: clamp(Math.round(num(t.weight, 3)), 0, 5) }));
  cfg.storyCount = clamp(Math.round(num(raw.storyCount, 8)), 6, 10);
  cfg.windowHours = clamp(num(raw.windowHours, 48), 12, 96);
  if (!cfg.hosts || cfg.hosts.length !== 2) throw new Error('config/podcast.json: exactly two hosts are required');
  return cfg;
}

let memo: { mtimeMs: number; cfg: PodcastConfig } | null = null;

/** Parsed + normalised config (re-read when the file changes). Throws a clear error when missing or malformed. */
export function loadConfig(): PodcastConfig {
  let st: fs.Stats;
  try {
    st = fs.statSync(CONFIG_PATH);
  } catch {
    throw new Error(`config/podcast.json is missing (${CONFIG_PATH}).`);
  }
  if (memo && memo.mtimeMs === st.mtimeMs) return memo.cfg;
  const cfg = normalize(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as PodcastConfig);
  memo = { mtimeMs: st.mtimeMs, cfg };
  return cfg;
}

export interface ConfigPatch {
  weights?: Record<string, number>;
  storyCount?: number;
}

/** Only topic weights and the story count are editable from the app; everything else is changed in the file. */
export function patchConfig(patch: ConfigPatch): PodcastConfig {
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as PodcastConfig;
  if (patch.weights) {
    const ids = new Set(raw.topics.map((t: TopicConfig) => t.id));
    for (const [id, w] of Object.entries(patch.weights)) {
      if (!ids.has(id)) throw new HttpError(`Unknown topic "${id}".`, 400);
      if (typeof w !== 'number' || !Number.isFinite(w) || w < 0 || w > 5) throw new HttpError(`Weight for "${id}" must be 0-5.`, 400);
    }
    raw.topics = raw.topics.map((t) => (t.id in patch.weights! ? { ...t, weight: Math.round(patch.weights![t.id]) } : t));
  }
  if (patch.storyCount !== undefined) {
    if (!Number.isInteger(patch.storyCount) || patch.storyCount < 6 || patch.storyCount > 10) throw new HttpError('storyCount must be an integer 6-10.', 400);
    raw.storyCount = patch.storyCount;
  }
  writeAtomicSync(CONFIG_PATH, `${JSON.stringify(raw, null, 2)}\n`);
  memo = null;
  return loadConfig();
}

export const geminiKey = () => (process.env.GEMINI_API_KEY ?? '').trim();
export const feedToken = () => (process.env.PODCAST_FEED_TOKEN ?? '').trim();
