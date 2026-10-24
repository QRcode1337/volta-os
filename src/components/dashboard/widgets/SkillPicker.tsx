'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pin, RotateCcw, Search, Zap } from 'lucide-react';
import type { RealSkill } from '@/types/sources';
import { cn } from '@/lib/cn';
import { HudModal } from './Overlay';
import {
  DECK_MAX,
  DISABLED_LABEL,
  DISABLED_NOTE,
  ambiguityNote,
  buildCommandIndex,
  commandInfo,
  isDisabled,
  isInstalled,
  isNotOnDisk,
  skillDescription,
  skillOrigin,
} from './right-skills';

type Filter = 'all' | 'used' | 'user' | 'plugin';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'used', label: 'USED 30D' },
  { id: 'user', label: 'USER' },
  { id: 'plugin', label: 'PLUGIN' },
];

interface SkillPickerProps {
  open: boolean;
  skills: RealSkill[];
  deckIds: string[];
  onToggle: (id: string) => void;
  onReset: () => void;
  onClose: () => void;
}

const FILTER_NOUN: Record<Filter, string> = { all: 'skills', used: 'skills used in the last 30 days', user: 'user skills', plugin: 'plugin skills' };

function emptyText(q: string, filter: Filter): string {
  if (q) return `No ${FILTER_NOUN[filter]} match “${q}”.`;
  return filter === 'used' ? 'No skills were used in the last 30 days.' : `No ${FILTER_NOUN[filter]} installed.`;
}

/** Searchable list of every installed skill; pin up to DECK_MAX into the home Skills Deck. */
export function SkillPicker({ open, skills, deckIds, onToggle, onReset, onClose }: SkillPickerProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(id);
  }, [open]);

  const pinned = useMemo(() => new Set(deckIds), [deckIds]);
  const cmdIndex = useMemo(() => buildCommandIndex(skills), [skills]);
  const full = deckIds.length >= DECK_MAX;
  // Same "installed" definition as the deck header and Second Brain → Skills: a SKILL.md exists on disk
  // (RealSkill.installed). The rest are listed but labelled "seen in transcripts".
  const installed = useMemo(() => skills.filter(isInstalled).length, [skills]);
  const disabledCount = useMemo(() => skills.filter(isDisabled).length, [skills]);
  const seen = skills.length - installed;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter((s) => {
      if (filter === 'used' && s.uses30d === 0) return false;
      if (filter === 'user' && s.source !== 'user') return false;
      if (filter === 'plugin' && s.source !== 'plugin') return false;
      if (!q) return true;
      return (
        s.id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.plugin ?? 'user').toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
      );
    });
  }, [skills, query, filter]);

  return (
    <HudModal
      open={open}
      onClose={onClose}
      icon={<Zap size={14} strokeWidth={2.2} />}
      title={
        <>
          PIN SKILLS <span className="text-muted">·</span>{' '}
          <span
            className="text-orange"
            title={
              disabledCount > 0
                ? `${installed} installed · ${installed - disabledCount} enabled · ${disabledCount} in disabled plugins`
                : `${installed} installed (SKILL.md on disk)`
            }
          >
            {installed} INSTALLED
          </span>
          {seen > 0 && (
            <span className="text-muted" title="No SKILL.md on disk: Claude Code built-ins, removed plugins or names several skills share">
              {' '}
              + {seen} SEEN IN TRANSCRIPTS
            </span>
          )}
        </>
      }
      headerExtra={
        <span
          className={cn(
            'ml-1 inline-flex h-5 items-center rounded-full border px-2 font-mono text-[9px] font-semibold tabular-nums tracking-[0.08em]',
            full ? 'border-orange/50 bg-orange/10 text-orange' : 'border-subtle bg-obsidian text-secondary',
          )}
        >
          {deckIds.length}/{DECK_MAX} PINNED
        </span>
      }
      footer={
        <>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-highlight hover:text-paper"
            title="Restore the default deck: top skills by 30-day uses"
          >
            <RotateCcw size={11} /> RESET TO TOP {DECK_MAX}
          </button>
          <span className="ml-auto font-mono text-[9.5px] text-muted">uses counted from ~/.claude transcripts · last 30 days</span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 items-center rounded-full border border-orange bg-orange px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-obsidian transition-[filter] hover:brightness-110"
          >
            DONE
          </button>
        </>
      }
    >
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-subtle bg-panel px-4 py-3">
        <label className="flex h-8 items-center gap-2 rounded-lg border border-subtle bg-obsidian px-2.5 transition-colors focus-within:border-orange/60">
          <Search size={13} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills, plugins, descriptions…"
            aria-label="Search skills"
            className="selectable min-w-0 flex-1 bg-transparent font-mono text-[11.5px] text-paper outline-none placeholder:text-muted"
          />
          <span className="shrink-0 font-mono text-[9.5px] tabular-nums text-muted">{rows.length}</span>
        </label>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'inline-flex h-6 items-center rounded-full border px-2.5 font-mono text-[9.5px] font-semibold tracking-[0.08em] transition-colors',
                filter === f.id
                  ? 'border-orange/60 bg-orange/15 text-orange'
                  : 'border-subtle bg-panel-elevated text-secondary hover:border-highlight hover:text-paper',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] text-muted">{emptyText(query.trim(), filter)}</p>
      ) : (
        <ul className="flex flex-col px-2 py-1.5">
          {rows.map((s) => {
            const on = pinned.has(s.id);
            const blocked = !on && full;
            const info = commandInfo(s, cmdIndex);
            const note = ambiguityNote(info);
            const offDisk = isNotOnDisk(s);
            const off = isDisabled(s);
            const where = offDisk ? 'Seen in transcripts only — no SKILL.md on disk (not counted as installed)' : s.path;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => !blocked && onToggle(s.id)}
                  aria-pressed={on}
                  disabled={blocked}
                  title={
                    blocked ? `Deck is full (${DECK_MAX}) — unpin one first` : [s.id, where, off ? DISABLED_NOTE : '', note].filter(Boolean).join('\n')
                  }
                  className={cn(
                    'group flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors',
                    on ? 'bg-orange/[0.07] hover:bg-orange/[0.11]' : 'hover:bg-panel-hover',
                    blocked && 'cursor-not-allowed opacity-45 hover:bg-transparent',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={cn('truncate font-mono text-[12px] font-semibold', on ? 'text-orange' : 'text-paper')}>
                        {info.display}
                      </span>
                      {info.ambiguous && (
                        <span
                          className="shrink-0 rounded-[4px] border border-amber/40 bg-amber/10 px-1 font-mono text-[8.5px] font-semibold uppercase leading-[14px] tracking-[0.08em] text-amber"
                          title={note}
                        >
                          {info.runnable ? 'shared name' : 'ambiguous'}
                        </span>
                      )}
                      <span
                        className={cn(
                          'shrink-0 rounded-[4px] border px-1 font-mono text-[8.5px] font-semibold uppercase leading-[14px] tracking-[0.08em]',
                          offDisk
                            ? 'border-dashed border-highlight bg-obsidian text-muted'
                            : s.source === 'plugin'
                              ? 'border-purple/40 bg-purple/10 text-purple'
                              : 'border-highlight bg-panel-elevated text-secondary',
                        )}
                      >
                        {skillOrigin(s)}
                      </span>
                      {off && (
                        <span
                          className="shrink-0 rounded-[4px] border border-dashed border-highlight bg-obsidian px-1 font-mono text-[8.5px] font-semibold uppercase leading-[14px] tracking-[0.08em] text-muted"
                          title={DISABLED_NOTE}
                        >
                          {DISABLED_LABEL}
                        </span>
                      )}
                      <span className={cn('ml-auto shrink-0 font-mono text-[10px] tabular-nums', s.uses30d ? 'text-paper' : 'text-muted')}>
                        {s.uses30d} <span className="text-muted">uses/30d</span>
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">
                      {skillDescription(s)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors',
                      on
                        ? 'border-orange bg-orange text-obsidian'
                        : 'border-subtle bg-obsidian text-muted group-hover:border-orange/60 group-hover:text-orange',
                    )}
                    aria-hidden
                  >
                    {on ? <Check size={12} strokeWidth={3} /> : <Pin size={11} strokeWidth={2.2} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </HudModal>
  );
}
