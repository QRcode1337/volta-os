'use client';
// Thin data views for the phone home. Every fetch goes through the existing shared-json store (same URLs and
// poll cadence as the desktop widgets, so a request is never duplicated); this file only reshapes the payloads.

import { useEffect, useMemo, useState } from 'react';
import type { RealRoutine, RealSkill } from '@/types/sources';
import { useNow } from '@/components/dashboard/widgets/hooks';
import { readLocal } from '@/components/dashboard/widgets/right-hooks';
import { useSharedJson } from '@/components/dashboard/widgets/shared-json';
import { DECK_KEY, DECK_MAX, defaultDeck, installedCountOf, isIdList } from '@/components/dashboard/widgets/right-skills';

export const ROUTINES_HREF = '/second-brain?view=routines';
export const SKILLS_HREF = '/second-brain?view=skills';

const ROUTINES_POLL_MS = 60_000;
const STALL_MS = 60 * 60_000; // same threshold as the desktop RoutinesWidget

export interface UpcomingRoutine {
  r: RealRoutine;
  at: number;
}

/** Routines view: enabled jobs with a next run (soonest first), stalled ones, and failing count. */
export function useRoutinesView() {
  const q = useSharedJson<{ routines: RealRoutine[] }>('/api/routines', ROUTINES_POLL_MS);
  const now = useNow(60_000);
  const routines = q.data?.routines;

  const view = useMemo(() => {
    const upcoming: UpcomingRoutine[] = [];
    const stalled: UpcomingRoutine[] = [];
    const enabled = (routines ?? []).filter((r) => r.enabled);
    const failing = enabled.filter((r) => r.health === 'failing').length;
    if (now) {
      const nowMs = now.getTime();
      for (const r of enabled) {
        const at = r.nextRunAt ? Date.parse(r.nextRunAt) : NaN;
        if (Number.isNaN(at)) continue; // interval / keep-alive / on-demand: no next run
        (at < nowMs - STALL_MS ? stalled : upcoming).push({ r, at });
      }
      upcoming.sort((a, b) => a.at - b.at);
      stalled.sort((a, b) => a.at - b.at);
    }
    return { upcoming, stalled, failing, enabledCount: enabled.length };
  }, [routines, now]);

  return { ...q, routines, now, ...view };
}

/** The pinned skills deck (localStorage, same keys as the desktop SkillsDeckWidget) or the default top-by-uses deck. */
export function useDeckSkills() {
  const q = useSharedJson<{ skills: RealSkill[]; installedCount?: number; enabledCount?: number }>('/api/skills-real', null);
  const [pinned, setPinned] = useState<string[] | null>(null);
  useEffect(() => {
    setPinned(readLocal(DECK_KEY, isIdList)); // after mount only (hydration-safe)
  }, []);

  const skills = q.data?.skills;
  const deck = useMemo(() => {
    if (!skills) return [];
    const byId = new Map(skills.map((s) => [s.id, s]));
    const ids = (pinned ?? defaultDeck(skills)).filter((id) => byId.has(id)).slice(0, DECK_MAX);
    return ids.map((id) => byId.get(id)!);
  }, [skills, pinned]);

  return { ...q, skills, deck, installedCount: installedCountOf(q.data) };
}

/** "Buy [[milk]] `now` **today** (2026-10-20)" → "Buy milk now today": drop markup and the pipeline's trailing dates. */
export function cleanActionText(text: string): string {
  return text
    .replace(/\[\[(\d{4}-\d{2}-\d{2})\]\]/g, '')
    .replace(/\(\d{4}-\d{2}-\d{2}\)/g, '')
    .replace(/\(aging \d+d\)/gi, '')
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*]{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
