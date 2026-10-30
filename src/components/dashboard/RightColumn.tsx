'use client';

import { NeedsYouWidget } from './widgets/NeedsYouWidget';
import { TodayWidget } from './widgets/TodayWidget';
import { RoutinesWidget } from './widgets/RoutinesWidget';
import { SkillsDeckWidget } from './widgets/SkillsDeckWidget';
import { YouTubeWidget } from './widgets/YouTubeWidget';

/**
 * Home dashboard right column: NEEDS YOU (content height) · TODAY (33%) · ROUTINES (27%) · SKILLS DECK (40%) of the
 * rest · YOUTUBE STUDIO (content height) — all real data.
 */
export function RightColumn() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3">
      <NeedsYouWidget className="flex-none" />
      <TodayWidget className="min-h-0 [flex:33_1_0%]" />
      <RoutinesWidget className="min-h-0 [flex:27_1_0%]" />
      <SkillsDeckWidget className="min-h-0 [flex:40_1_0%]" />
      <YouTubeWidget className="flex-none" />
    </div>
  );
}

export default RightColumn;
