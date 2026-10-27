import { LeftColumn } from '@/components/dashboard/LeftColumn';
import { CenterOrbitalCore } from '@/components/dashboard/CenterOrbitalCore';
import { RightColumn } from '@/components/dashboard/RightColumn';
import { UsageRoboBar } from '@/components/mods/UsageRoboBar';
import { GlobalShortcuts } from '@/components/mods/GlobalShortcuts';
import { MobileHome } from '@/components/mobile/MobileHome';
import { ResponsiveHome } from '@/components/mobile/ResponsiveHome';

/**
 * Home OS shell.
 * <768px (phone): the single-column "Today" feed (MobileHome) above the fixed MobileTabBar.
 * ≥1280px: single 100vh screen, 24/52/24 bento grid, no page scroll.
 * 768–1279px: stacked single column (center first); the root div becomes the scroll region.
 * Bottom padding clears the 46px reserved for the fixed UsageRoboBar.
 */
export default function Home() {
  return <ResponsiveHome phone={<MobileHome />} desktop={<DesktopHome />} />;
}

function DesktopHome() {
  return (
    <div className="hud-scroll h-screen w-screen overflow-y-auto overflow-x-hidden bg-obsidian p-3 pb-[52px] xl:overflow-hidden">
      <main className="flex flex-col gap-3 xl:grid xl:h-full xl:grid-cols-[minmax(0,24fr)_minmax(0,52fr)_minmax(0,24fr)] xl:grid-rows-[minmax(0,1fr)]">
        <section aria-label="Left column" className="h-[1100px] min-h-0 min-w-0 xl:h-full">
          <LeftColumn />
        </section>
        <section
          aria-label="Orbital core"
          className="order-first h-[86vh] min-h-[620px] min-w-0 xl:order-none xl:h-full xl:min-h-0"
        >
          <CenterOrbitalCore />
        </section>
        <section aria-label="Right column" className="h-[1100px] min-h-0 min-w-0 xl:h-full">
          <RightColumn />
        </section>
      </main>
      <UsageRoboBar />
      <GlobalShortcuts />
    </div>
  );
}
