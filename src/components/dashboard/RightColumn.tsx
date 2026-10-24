'use client';

import { TodayWidget } from './widgets/TodayWidget';
import { RoutinesWidget } from './widgets/RoutinesWidget';
import { SkillsDeckWidget } from './widgets/SkillsDeckWidget';

/** Home dashboard right column: TODAY (33%) · ROUTINES (27%) · SKILLS DECK (40%) — all real local data. */
export function RightColumn() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3">
      <TodayWidget className="min-h-0 [flex:33_1_0%]" />
      <RoutinesWidget className="min-h-0 [flex:27_1_0%]" />
      <SkillsDeckWidget className="min-h-0 [flex:40_1_0%]" />
    </div>
  );
}

export default RightColumn;
