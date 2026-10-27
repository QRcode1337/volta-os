import 'server-only';
import type { MediaStatus } from '@/types/media';
import { GEN_ROOT, elevenKey, errorMessage, geminiKey, xaiKey } from './config';
import { listOmniModels } from './gemini';
import { getQuota, listTtsModels, listVoices } from './elevenlabs';
import { dailySpend } from './budget';
import { checkStorage } from './storage';
import { listImageModels, listVideoModels } from './xai';

export async function getStatus(): Promise<MediaStatus> {
  const settled = async <T>(p: Promise<T>): Promise<{ v?: T; e?: string }> => p.then((v) => ({ v }), (err) => ({ e: errorMessage(err) }));

  const [storage, spend, imgs, vids, voices, models, quota] = await Promise.all([
    checkStorage(),
    dailySpend().catch(() => null),
    xaiKey() ? settled(listImageModels()) : Promise.resolve({} as { v?: never; e?: string }),
    xaiKey() ? settled(listVideoModels()) : Promise.resolve({} as { v?: never; e?: string }),
    elevenKey() ? settled(listVoices()) : Promise.resolve({} as { v?: never; e?: string }),
    elevenKey() ? settled(listTtsModels()) : Promise.resolve({} as { v?: never; e?: string }),
    elevenKey() ? settled(getQuota()) : Promise.resolve({} as { v?: never; e?: string }),
  ]);

  return {
    now: new Date().toISOString(),
    storage: storage.ok ? storage : { ok: false, root: GEN_ROOT, reason: storage.reason },
    todaySpendUsd: spend?.generationsUsd ?? 0,
    spend,
    xai: xaiKey()
      ? {
          configured: true,
          imageModels: imgs.v ?? [],
          videoModels: vids.v ?? [],
          imageError: imgs.e,
          videoError: vids.e ?? (vids.v && vids.v.length === 0 ? 'xAI lists no video models this key can use.' : undefined),
        }
      : { configured: false, missing: 'XAI_API_KEY' },
    gemini: geminiKey() ? { configured: true, videoModels: listOmniModels() } : { configured: false, missing: 'GEMINI_API_KEY' },
    elevenlabs: elevenKey()
      ? { configured: true, voices: voices.v ?? [], models: models.v ?? [], quota: quota.v ?? null, error: voices.e ?? models.e ?? quota.e }
      : { configured: false, missing: 'ELEVENLABS_API_KEY' },
  };
}
