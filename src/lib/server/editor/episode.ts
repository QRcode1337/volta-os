import 'server-only';
import type { EditorEpisodeRef, EditorEpisodeTag } from '@/types/editor';
import { HttpError } from '../http-error';
import { getCatalog } from '../notion/catalog';

/**
 * Turn the browser's tag ({ key, section }) into the ref stored with the pins: title and Notion links come from the
 * Video Production index, never from the client. If Notion is unreachable the existing ref (same episode) is reused.
 */
export async function resolveEpisode(tag: EditorEpisodeTag, existing: EditorEpisodeRef | null): Promise<EditorEpisodeRef> {
  try {
    const ep = (await getCatalog()).episodes.find((e) => e.key === tag.key);
    if (!ep) throw new HttpError(`Episode ${tag.key} is not in the Video Production index.`, 422);
    return {
      key: ep.key,
      number: ep.number,
      title: ep.title,
      section: tag.section,
      outlineId: ep.outline?.id ?? null,
      outlineTitle: ep.outline?.title ?? null,
      outlineUrl: ep.outline?.url ?? null,
      ledgerUrl: ep.ledger?.url ?? null,
      taggedAt: existing?.key === ep.key ? existing.taggedAt : new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (existing && existing.key === tag.key) return { ...existing, section: tag.section };
    throw new HttpError(`Could not read the Video Production index to tag this file: ${(err as Error).message}`, 502);
  }
}
