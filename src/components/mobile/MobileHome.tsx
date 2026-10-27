'use client';
// Phone home (<768px): a single-column "Today" feed. Page-level scroll only: the coordinator's scroll root scrolls,
// this tree sets no overflow (that would break the sticky header). Rendered by page.tsx behind `md:hidden`.

import { MobileHeader } from './home/MobileHeader';
import { NeedsYouCard } from './home/NeedsYouCard';
import { AwaitingCard } from './home/AwaitingCard';
import { TodayCard } from './home/TodayCard';
import { LtmCard } from './home/LtmCard';
import { SourcesCard } from './home/SourcesCard';
import { SecondBrainCard } from './home/SecondBrainCard';
import { RoutinesCard } from './home/RoutinesCard';
import { SkillsCard } from './home/SkillsCard';

export function MobileHome() {
  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-obsidian">
      <MobileHeader />
      {/* The tab bar's space is reserved by the shell (globals.css shortens .h-screen.w-screen below md). */}
      <main className="flex min-w-0 flex-col gap-3 px-4 pt-3 pb-4">
        <NeedsYouCard />
        <AwaitingCard />
        <TodayCard />
        <LtmCard />
        <SourcesCard />
        <SecondBrainCard />
        <RoutinesCard />
        <SkillsCard />
      </main>
    </div>
  );
}

export default MobileHome;
