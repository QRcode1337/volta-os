import 'server-only';
import { HttpError } from '../http-error';
import type { DailySpend } from '@/types/media';
import { listEpisodes } from '@/lib/server/podcast/storage';
import { DAILY_CAP_USD, MAX_REQUEST_USD } from './config';
import { round6 } from './pricing';
import { localDate, todaySpendUsd } from './storage';

// Daily spend guardrail. The ledgers are the existing append-only Generations manifest (one row per saved file,
// with its est. USD) and the podcast manifest (per-episode Gemini TTS cost). Both live on Windsor, not iCloud.
// Read-only here: nothing in this file writes to either ledger.

/** Podcast Gemini TTS USD for episodes created on the local calendar day (list price from reported usage). */
async function podcastTodayUsd(): Promise<number> {
  const today = localDate();
  let sum = 0;
  for (const e of await listEpisodes()) {
    if (e.createdAt && localDate(new Date(e.createdAt)) === today) sum += Number(e.cost?.ttsUsd) || 0;
  }
  return round6(sum);
}

/** Today's recorded spend vs the daily cap. Throws if the Generations ledger can't be read (callers decide). */
export async function dailySpend(): Promise<DailySpend> {
  const [generationsUsd, podcastUsd] = await Promise.all([todaySpendUsd(), podcastTodayUsd().catch(() => 0)]);
  const totalUsd = round6(generationsUsd + podcastUsd);
  return {
    date: localDate(),
    generationsUsd,
    podcastUsd,
    totalUsd,
    capUsd: DAILY_CAP_USD,
    remainingUsd: round6(Math.max(0, DAILY_CAP_USD - totalUsd)),
    perRequestCapUsd: MAX_REQUEST_USD,
  };
}

/**
 * Refuse (402) a paid request whose estimate would push today's spend over the daily cap. Free requests ($0 est.)
 * always pass. Fails closed: if the spend ledger can't be read, nothing paid starts.
 */
export async function assertWithinDailyCap(estUsd: number): Promise<DailySpend> {
  let s: DailySpend;
  try {
    s = await dailySpend();
  } catch (err) {
    if (estUsd <= 0) throw err;
    throw new HttpError(`Cannot read today's spend ledger, so paid generation is paused: ${(err as Error).message}`, 503);
  }
  if (estUsd > 0 && s.totalUsd + estUsd > s.capUsd + 1e-9) {
    const parts = s.podcastUsd > 0 ? ` (Generations $${s.generationsUsd.toFixed(2)} + podcast TTS $${s.podcastUsd.toFixed(2)})` : '';
    throw new HttpError(
      `Daily spend cap: $${s.totalUsd.toFixed(2)} spent today${parts} + this request's est. $${estUsd.toFixed(2)} would exceed the $${s.capUsd.toFixed(2)} daily cap ($${s.remainingUsd.toFixed(2)} left). Try a smaller request or wait until tomorrow (set VOLTA_GEN_DAILY_USD to change the cap).`,
      402,
    );
  }
  return s;
}
