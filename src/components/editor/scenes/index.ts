// Registry of the 8 procedural VOLTA scenes (one per EDITOR_SCENE_KEYS entry).
import { armsStack } from './armsStack';
import { brainOrb } from './brainOrb';
import { cacheMeter } from './cacheMeter';
import type { SceneDef } from './common';
import { jevRouter } from './jevRouter';
import { outroCta } from './outroCta';
import { ringZoom } from './ringZoom';
import { titleReveal } from './titleReveal';
import { wildcardSplit } from './wildcardSplit';

export type { SceneDef, SceneMeta, SceneHotspot } from './common';
export { drawCaption } from './common';

export const SCENES: Record<string, SceneDef> = {
  'title-reveal': titleReveal,
  'ring-zoom': ringZoom,
  'arms-stack': armsStack,
  'wildcard-split': wildcardSplit,
  'cache-meter': cacheMeter,
  'brain-orb': brainOrb,
  'jev-router': jevRouter,
  'outro-cta': outroCta,
};

export function getScene(key: string | undefined): SceneDef {
  return (key && SCENES[key]) || titleReveal;
}

/** Hotspot label for a point on a given scene ("" when none). */
export function hotspotAt(sceneKey: string, x: number, y: number): string {
  const s = getScene(sceneKey);
  const hit = s.hotspots.find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
  return hit?.label ?? '';
}
