// Shared (client + server) shapes for the "Generate in Suno" panel. No runtime imports so both sides can use it.

/** Env vars the local suno-api service needs before it can generate. */
export type SunoMissing = 'SUNO_COOKIE' | 'TWOCAPTCHA_KEY';

export type SunoState =
  /** Service up, cookie + 2Captcha key set, credits readable. */
  | 'ready'
  /** Service not reachable (not running, still starting, or the Windsor drive is unplugged). */
  | 'down'
  /** Service is up but SUNO_COOKIE and/or TWOCAPTCHA_KEY are still empty in its .env. */
  | 'needs_setup'
  /** Keys are set but Suno refused the session (expired cookie) or the service errored. */
  | 'auth_error';

export interface SunoCredits {
  left: number;
  monthlyLimit: number | null;
  monthlyUsage: number | null;
  period: string | null;
}

export interface SunoStatus {
  state: SunoState;
  ready: boolean;
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

export interface SunoGenerateBody {
  title: string;
  /** Comma-separated style tags, e.g. "dark synthwave, 100 bpm, female vocals". */
  tags: string;
  lyrics: string;
  instrumental: boolean;
  /** Must be true: each generation spends Suno credits. */
  confirm: boolean;
}

export type SunoClipStatus = 'submitted' | 'queued' | 'streaming' | 'complete' | 'error' | string;

export interface SunoClip {
  id: string;
  status: SunoClipStatus;
  title: string;
  audioUrl: string | null;
  imageUrl: string | null;
  durationSec: number | null;
  error: string | null;
}

/** Context the client sends when saving, so the notes written to meta.json match what was asked for. */
export interface SunoSaveContext {
  title: string;
  tags: string;
  lyrics: string;
  instrumental: boolean;
  credits: SunoCredit[];
}

export interface SunoSaveResult {
  id: string;
  state: 'saved' | 'exists' | 'pending' | 'error';
  /** File name inside the Suno folder (saved / exists). */
  file?: string;
  message?: string;
}
