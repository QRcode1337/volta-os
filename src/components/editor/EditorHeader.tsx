'use client';

import { ArrowLeft, ClipboardCopy, Eye, RotateCcw, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { memo, type ReactNode } from 'react';
import { PixelMascotLogo } from '@/components/robo-ui';
import { cn } from '@/lib/cn';
import { EDITOR_PROJECTS } from '@/lib/mock-data';
import type { ClipFilter } from './types';

export const TEACH_TOOLTIPS = {
  cut: 'Appends reinforcement learning rules to update workspace/skills/cut/SKILL.md based on your pacing/cutting feedback',
  animate: 'Appends reinforcement learning rules to update workspace/skills/animate/SKILL.md based on your motion/layout feedback',
} as const;

const FILTERS: { value: ClipFilter; label: string }[] = [
  { value: 'all', label: 'All Clips' },
  { value: 'needs-review', label: 'Needs review' },
  { value: 'changes-requested', label: 'Changes requested' },
  { value: 'approved', label: 'Approved' },
  { value: 'has-pins', label: 'Has pins' },
];

function TeachToggle({ on, label, tip, onToggle }: { on: boolean; label: string; tip: string; onToggle: () => void }) {
  return (
    <div className="group relative">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        title={tip}
        onClick={onToggle}
        className={cn(
          'flex h-7 items-center gap-2 rounded-full border pl-1 pr-3 font-mono text-[10.5px] font-semibold transition-all',
          on ? 'border-green/70 bg-green/10 text-green shadow-[0_0_14px_rgba(34,197,94,0.35)]' : 'border-subtle bg-panel-elevated text-secondary hover:text-paper',
        )}
      >
        <span className={cn('relative h-5 w-9 rounded-full transition-colors', on ? 'bg-green/30' : 'bg-obsidian')}>
          <span
            className={cn('absolute top-0.5 h-4 w-4 rounded-full transition-all', on ? 'left-[18px] bg-green shadow-[0_0_8px_#22C55E]' : 'left-0.5 bg-muted')}
          />
        </span>
        <span className="whitespace-nowrap">{on ? '●' : '○'} {label}</span>
      </button>
      <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-72 -translate-x-1/2 rounded-md border border-highlight bg-panel-elevated px-3 py-2 text-[11.5px] leading-snug text-paper shadow-xl shadow-black/60 group-hover:block">
        {tip}
      </div>
    </div>
  );
}

function HBtn({ onClick, children, primary, disabled, title }: { onClick: () => void; children: ReactNode; primary?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 font-mono text-[10.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        primary ? 'border-orange bg-orange text-obsidian hover:brightness-110' : 'border-subtle bg-panel-elevated text-secondary hover:border-highlight hover:text-paper',
      )}
    >
      {children}
    </button>
  );
}

export interface EditorHeaderProps {
  project: string;
  teachCut: boolean;
  teachAnimate: boolean;
  filter: ClipFilter;
  unresolvedCount: number;
  applying: boolean;
  onProject: (p: string) => void;
  onToggleTeach: (s: 'cut' | 'animate') => void;
  onFilter: (f: ClipFilter) => void;
  onPreview: () => void;
  onCopyAll: () => void;
  onApply: () => void;
  onReset: () => void;
}

export const EditorHeader = memo(function EditorHeader(p: EditorHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-subtle bg-panel/80 px-3">
      <Link href="/" className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-subtle px-2 font-mono text-[10.5px] text-secondary hover:border-highlight hover:text-paper">
        <ArrowLeft size={13} /> Back to VOLTA OS
      </Link>
      <div className="flex shrink-0 items-center gap-2 pl-1">
        <PixelMascotLogo size={22} />
        <span className="text-[17px] font-bold tracking-tight text-paper">
          VOLTA <span className="font-doto font-extrabold text-orange">EDITOR</span>
        </span>
      </div>
      <label className="ml-2 flex min-w-0 items-center gap-1.5 font-mono text-[10.5px] text-muted">
        <span className="hidden xl:inline">Project:</span>
        <select
          value={p.project}
          onChange={(e) => p.onProject(e.target.value)}
          className="h-7 min-w-0 max-w-[260px] truncate rounded-md border border-subtle bg-panel-elevated px-2 text-[11px] text-paper outline-none focus:border-orange/60"
          aria-label="Project"
        >
          {EDITOR_PROJECTS.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <TeachToggle on={p.teachCut} label="Teach my /cut" tip={TEACH_TOOLTIPS.cut} onToggle={() => p.onToggleTeach('cut')} />
        <TeachToggle on={p.teachAnimate} label="Teach my /animate" tip={TEACH_TOOLTIPS.animate} onToggle={() => p.onToggleTeach('animate')} />
        <label className="flex h-7 items-center gap-1 rounded-md border border-subtle bg-panel-elevated px-2 font-mono text-[10.5px] text-secondary">
          Filter:
          <select value={p.filter} onChange={(e) => p.onFilter(e.target.value as ClipFilter)} className="bg-transparent text-paper outline-none" aria-label="Clip filter">
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value} className="bg-panel">
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <HBtn onClick={p.onReset} title="Discard local pins/toggles and restore the seed project">
          <RotateCcw size={12} />
          <span className="hidden 2xl:inline">Reset to seed</span>
        </HBtn>
        <HBtn onClick={p.onPreview} title="Preview the exact compiled prompt">
          <Eye size={12} /> <span className="hidden xl:inline">Preview Prompt</span>
        </HBtn>
        <HBtn onClick={p.onApply} disabled={p.applying} title="Write learned rules into workspace/skills/*/SKILL.md and show the diff">
          <Wand2 size={12} className={p.applying ? 'robo-spin' : ''} /> <span className="hidden lg:inline">{p.applying ? 'Applying…' : 'Apply & Teach Locally'}</span>
        </HBtn>
        <HBtn onClick={p.onCopyAll} primary title="Copy every unresolved pin + RL directives as a structured prompt">
          <ClipboardCopy size={12} /> 📋 Copy All Comments ({p.unresolvedCount})
        </HBtn>
      </div>
    </header>
  );
});
