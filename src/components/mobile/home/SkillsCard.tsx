'use client';
// Skills deck: swipeable row of the pinned skills (same localStorage deck + default as the desktop SkillsDeckWidget).
// Read-only on purpose: running a skill (cost, routing matrix, execution report) stays on the desktop deck.

import Link from 'next/link';
import { Zap } from 'lucide-react';
import { errorText } from '@/components/dashboard/widgets/right-hooks';
import { DISABLED_LABEL, isDisabled, skillCommand, skillOrigin } from '@/components/dashboard/widgets/right-skills';
import { SKILLS_HREF, useDeckSkills } from './data';
import { Chip, MCard, OfflineNote, Skel } from './parts';

export function SkillsCard() {
  const { deck, skills, installedCount, error, loading, refreshing, reload } = useDeckSkills();

  let body;
  if (!skills && (loading || !error)) {
    body = (
      <div aria-label="Loading skills" className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <Skel key={i} className="h-[76px] w-[148px] shrink-0 rounded-lg" />
        ))}
      </div>
    );
  } else if (!skills) {
    body = <OfflineNote label="Skills offline" message={errorText(error)} onRetry={() => void reload()} busy={refreshing} />;
  } else if (deck.length === 0) {
    body = <p className="text-[12.5px] leading-snug text-secondary">No skills pinned yet. Pin some from the desktop Skills Deck.</p>;
  } else {
    body = (
      <ul className="-mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {deck.map((s) => (
          <li key={s.id} className="w-[148px] shrink-0 snap-start">
            <Link
              href={SKILLS_HREF}
              className="flex min-h-[76px] flex-col justify-between gap-1.5 rounded-lg border border-subtle bg-obsidian/60 p-2.5 active:bg-panel-hover/60"
            >
              <span className="flex items-center gap-1.5">
                <Zap size={12} aria-hidden className="shrink-0 text-orange" />
                <span className="min-w-0 truncate font-mono text-[12px] font-semibold text-paper">{skillCommand(s)}</span>
              </span>
              <span className="min-w-0">
                <span className="block font-mono text-[10px] leading-[14px] tabular-nums text-secondary">
                  {s.uses30d} use{s.uses30d === 1 ? '' : 's'} / 30d
                </span>
                <span className="block truncate font-mono text-[10px] leading-[14px] text-muted">
                  {skillOrigin(s)}
                  {isDisabled(s) ? ` · ${DISABLED_LABEL}` : ''}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <MCard
      title="Skills"
      icon={<Zap size={14} strokeWidth={2.2} />}
      href={SKILLS_HREF}
      headerExtra={installedCount != null ? <Chip title="Installed skills (SKILL.md on disk)">{installedCount} installed</Chip> : null}
    >
      {body}
    </MCard>
  );
}
