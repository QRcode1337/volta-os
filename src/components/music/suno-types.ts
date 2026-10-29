// Shared (client + server) shapes for the "Create in Suno" panel. No runtime imports so both sides can use it.

/** Env vars the local suno-api service needs before it can read credits. */
export type SunoMissing = 'SUNO_COOKIE';

export type SunoState =
  /** Service up, cookie set, credits readable. */
  | 'ready'
  /** Service not reachable (not running, still starting, or the Windsor drive is unplugged). */
  | 'down'
  /** Service is up but SUNO_COOKIE is still empty in its .env. */
  | 'needs_setup'
  /** Cookie is set but Suno refused the session (expired cookie) or the service errored. */
  | 'auth_error';

export interface SunoCredits {
  left: number;
  monthlyLimit: number | null;
  monthlyUsage: number | null;
  period: string | null;
}

export interface SunoStatus {
  /** State of the local suno-api service, which only reads credits now. */
  state: SunoState;
  ready: boolean;
  /** Creating needs only the Windsor drive (finished files are imported there); the suno-api service is optional. */
  canCreate: boolean;
  credits: SunoCredits | null;
  missing: SunoMissing[];
  /** Human-readable, safe to show. */
  message: string;
  serviceUrl: string;
  /** The file the user edits to finish setup. */
  envPath: string;
  /** Shell command that restarts the LaunchAgent after editing .env. */
  restartCommand: string;
  logPath: string;
  outDir: string;
  windsorMounted: boolean;
}

export type SunoCredit = 'Patrick' | 'Suno' | 'Seraphim of the Void';
export const SUNO_CREDIT_CHOICES: SunoCredit[] = ['Patrick', 'Suno', 'Seraphim of the Void'];

/** Suno's Create page tabs: Songs, Speech and Sounds. */
export type SunoMode = 'song' | 'speech' | 'sound';
export type SunoVoice = 'any' | 'female' | 'male';
export type SunoSoundType = 'one-shot' | 'loop';

export interface SunoCreateBody {
  mode: SunoMode;
  title: string;
  /** Song: comma-separated style tags, e.g. "dark synthwave, 100 bpm, female vocals". */
  tags: string;
  /** Song: lyrics with bracketed composition cues (ignored when instrumental). */
  lyrics: string;
  instrumental: boolean;
  /** Speech: the words to speak. */
  script: string;
  /** Speech: delivery, pacing, mood and setting. */
  tone: string;
  /** Speech: Advanced → Vocal Gender. */
  voice: SunoVoice;
  /** Sound: what to make. */
  sound: string;
  soundType: SunoSoundType;
  /** Sound: BPM, or empty for Auto. */
  bpm: string;
  /** Sound: key, or empty / "Any". */
  key: string;
  /** Must be true: each creation spends Suno credits. */
  confirm: boolean;
}

export interface SunoDraftBody {
  kind: 'style' | 'lyrics' | 'tone' | 'script' | 'sound';
  /** What Patrick wants, in his words. */
  brief: string;
  /** The field's current text, to revise rather than start over. */
  current: string;
  /** The other fields (title, style, ...) so the draft fits them. */
  context: string;
}

export interface SunoDraftResult {
  text: string;
  model: string | null;
}

export interface SunoHandoff {
  opened: boolean;
  error: string | null;
  /** The full brief, so the panel can offer to copy it when Terminal could not be opened. */
  prompt: string;
  /** Epoch ms when the handoff started; the import only picks up downloads newer than this. */
  since: number;
}

/** Context the client sends when importing, so the notes written to meta.json match what was asked for. */
export interface SunoSaveContext {
  mode: SunoMode;
  title: string;
  tags: string;
  /** Song lyrics, or the speech script. */
  lyrics: string;
  instrumental: boolean;
  credits: SunoCredit[];
}

export interface SunoImportResult {
  /** File name as it was in ~/Downloads. */
  from: string;
  state: 'saved' | 'duplicate' | 'error';
  /** File name inside the Suno folder (saved / duplicate). */
  file?: string;
  message?: string;
}
