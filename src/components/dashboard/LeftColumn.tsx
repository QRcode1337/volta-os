'use client';

import { MicroAppsWidget } from './widgets/MicroAppsWidget';
import { CalendarWidget } from './widgets/CalendarWidget';
import { MemorySourcesWidget } from './widgets/MemorySourcesWidget';

/**
 * Home dashboard left column: MICRO APPS · CALENDAR + LTM activity · MEMORY SOURCES.
 * Calendar and Memory Sources take their content height (~250px / ~185px of body); Micro Apps
 * absorbs whatever is left and scrolls internally. On very short viewports Memory Sources may
 * shrink and scroll too (it is the only other shrinkable panel), so nothing is clipped. Opening a Memory
 * Sources row keeps that panel at its collapsed height (the row's details scroll inside it), so Micro Apps
 * never loses space to it.
 */
export function LeftColumn() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3">
      {/* `!` beats HudPanel's own min-h-0 (cn() does no class merging). */}
      <MicroAppsWidget className="min-h-[96px]! [flex:1_1_0%]" />
      <CalendarWidget className="flex-none" />
      <MemorySourcesWidget className="[flex:0_1_auto]" />
    </div>
  );
}

export default LeftColumn;
