import 'server-only';
import { netlifySites } from './netlify';
import { notionPins } from './notion';
import { topRepos } from './repos';
import { loadServices } from './services';
import { safeMessage } from './safe';
import type { LaunchpadPayload, LaunchpadSectionName, Section } from './types';

async function section<T>(load: () => Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (err) {
    console.error('[launchpad]', err);
    return { ok: false, error: safeMessage(err) };
  }
}

export const SECTION_NAMES: readonly LaunchpadSectionName[] = ['services', 'netlify', 'repos', 'notion'];

export function loadSection(name: LaunchpadSectionName, force: boolean) {
  switch (name) {
    case 'services':
      return section(() => loadServices(force));
    case 'netlify':
      return section(() => netlifySites(force));
    case 'repos':
      return section(() => topRepos(force));
    case 'notion':
      return section(() => notionPins());
  }
}

export async function loadAll(force: boolean): Promise<LaunchpadPayload> {
  const [services, netlify, repos, notion] = await Promise.all(SECTION_NAMES.map((n) => loadSection(n, force)));
  return { generatedAt: new Date().toISOString(), services, netlify, repos, notion } as LaunchpadPayload;
}
