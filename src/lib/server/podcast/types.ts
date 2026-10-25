// Shared (server + client) types for the VOLTA Daily Briefing podcast. Types only: safe to `import type` from client code.

export interface TopicConfig {
  id: string;
  label: string;
  /** 0-5. Drives story selection, airtime and the JEV ranking criterion. 0 = skip the topic entirely. */
  weight: number;
  /** A user focus area: always researched and guaranteed a slot when it has a credible story. */
  focus: boolean;
  /** One line given to the research stage so it knows what counts as news for this topic. */
  brief: string;
  /** Lower-case phrases used to classify and filter arXiv / RSS / Notion items. */
  keywords: string[];
}

export interface HostConfig {
  name: string;
  /** Gemini prebuilt voice name. */
  voice: string;
  persona: string;
}

export interface RssSourceConfig {
  id: string;
  label: string;
  url: string;
  topic: string;
}

export interface PodcastConfig {
  version: number;
  title: string;
  description: string;
  author: string;
  language: string;
  publicBaseUrl: string;
  hosts: [HostConfig, HostConfig];
  topics: TopicConfig[];
  storyCount: number;
  windowHours: number;
  arxiv: { categories: string[]; maxResults: number; widenToHours: number; keywords: string[] };
  rss: RssSourceConfig[];
  notion: { databaseId: string; maxItems: number };
  feeds: { enabled: boolean; sources: string[]; maxItems: number };
  research: { model: string; timeoutSec: number; parallel: number; storiesPerTopic: number };
  script: { model: string; timeoutSec: number; targetWords: number; minWords: number; maxWords: number };
  quick: { model: string; timeoutSec: number };
  tts: { model: string; chunkChars: number; gapMs: number; timeoutSec: number };
  audio: { lufs: number; bitrateKbps: number };
  cost: { confirmAboveUsd: number; hardCapUsd: number };
}

export type Confidence = 'high' | 'medium' | 'low';
export type Origin = 'research' | 'arxiv' | 'rss' | 'notion' | 'feeds';
/** How well the claim is grounded: opened-and-read web source, paper abstract, feed/RSS snippet, or an internal VOLTA report. */
export type Evidence = 'verified-web' | 'primary-abstract' | 'feed-summary' | 'internal';

export interface SourceRef {
  url: string;
  title: string;
  publisher?: string;
  kind?: 'primary' | 'secondary';
}

export interface Story {
  /** S1..Sn: the citation marker used in the script and the show notes. */
  id: string;
  topic: string;
  headline: string;
  whatHappened: string;
  whyItMatters: string;
  sources: SourceRef[];
  date: string | null;
  confidence: Confidence;
  evidence: Evidence;
  origins: Origin[];
  /** Final blended score 0-1 (JEV + quality + topic weight). */
  score: number;
  /** JEV significance 0-1 when JEV was available. */
  jev: number | null;
}

export type Stage = 'gather' | 'research' | 'rank' | 'script' | 'tts' | 'assemble' | 'store';
export const STAGES: Stage[] = ['gather', 'research', 'rank', 'script', 'tts', 'assemble', 'store'];

export interface StageTiming {
  stage: Stage;
  startedAt: string;
  endedAt: string | null;
  ms: number | null;
  note?: string;
}

export interface CostBreakdown {
  /** Gemini TTS, USD (list price from reported usage; $0 billed on the free tier). */
  ttsUsd: number;
  ttsInputTokens: number;
  ttsAudioTokens: number;
  /** claude -p list-price equivalent, USD. Informational only: runs on the Max plan, never billed. */
  claudeListUsd: number;
}

export interface EpisodeRecord {
  date: string;
  title: string;
  description: string;
  file: string;
  notesFile: string;
  scriptFile: string;
  bytes: number;
  durationSec: number;
  words: number;
  createdAt: string;
  stories: Story[];
  topicsCovered: string[];
  scriptBackend: string;
  ttsModel: string;
  cost: CostBreakdown;
  timings: StageTiming[];
  researchMs: number;
  jevUsed: boolean;
  warnings: string[];
}

export interface Manifest {
  version: 1;
  episodes: EpisodeRecord[];
}

export interface JobState {
  id: string;
  date: string;
  status: 'running' | 'done' | 'failed';
  trigger: 'manual' | 'scheduled';
  stage: Stage | null;
  /** Human-readable progress line. */
  detail: string;
  startedAt: string;
  endedAt: string | null;
  timings: StageTiming[];
  warnings: string[];
  error: string | null;
  estUsd: number;
  episode: EpisodeRecord | null;
}

export interface CostEstimate {
  usd: number;
  /** Upper bound used for the confirm step (script at maxWords). */
  maxUsd: number;
  audioMinutes: number;
  model: string;
  breakdown: string;
  needsConfirm: boolean;
  confirmAboveUsd: number;
}

export interface PodcastStatus {
  storage: { ok: boolean; root: string; freeBytes?: number; reason?: string };
  keys: { gemini: boolean; feedToken: boolean; notion: boolean; jev: boolean };
  ffmpeg: boolean;
  claudeBin: string | null;
  config: PodcastConfig;
  estimate: CostEstimate;
  job: JobState | null;
  today: string;
  hasToday: boolean;
  publicBaseUrl: string;
}
