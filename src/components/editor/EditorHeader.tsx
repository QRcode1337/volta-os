'use client';

import { ArrowLeft, ClipboardCopy, Eye, FileText, Eraser, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { memo, type ReactNode } from 'react';
import { PixelMascotLogo } from '@/components/robo-ui';
import { cn } from '@/lib/cn';
import type { ClipFilter } from './types';

export const TEACH_TOOLTIPS = {
  cut: 'Adds a /cut directive to the copied prompt that points at your live video skills in ~/.claude/skills (see Preview Prompt). "Apply & Teach" also appends the rule to VOLTA\'s workspace copy, workspace/skills/cut/SKILL.md, which is not a live skill.',
  animate: 'Adds an /animate directive to the copied prompt that points at your live HyperFrames / Remotion skills in ~/.claude/skills (see Preview Prompt). "Apply & Teach" also appends the rule to VOLTA\'s workspace copy, workspace/skills/animate/SKILL.md, which is not a live skill.',
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
    <div className="group relative max-md:shrink-0">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        title={tip}
        onClick={onToggle}
        className={cn(
          'flex h-9 items-center gap-2 rounded-full border pl-1 pr-3 font-mono text-[10.5px] md:h-7 font-semibold transition-all',
          on ? 'border-green/70 bg-green/10 text-green shadow-[0_0_14px_rgba(34,197,94,0.35)]' : 'border-subtle bg-panel-elevated text-secondary hover:text-paper',
        )}
      >
        <span className={cn('relative h-5 w-9 rounded-full transition-colors', on ? 'bg-green/30' : 'bg-obsidian')}>
          <span
            className={cn('absolute top-0.5 h-4 w-4 rounded-full transition-all', on ? 'left-[18px] bg-green shadow-[0_0_8px_#22C55E]' : 'left-0.5 bg-muted')}
          />
        </span>
        <span className="whitespace-nowrap">
          {on ? '●' : '○'} <span className="hidden xl:inline">Teach my </span>
          {label}
        </span>
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
        'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 font-mono md:h-7 text-[10.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        primary ? 'border-orange bg-orange text-obsidian hover:brightness-110' : 'border-subtle bg-panel-elevated text-secondary hover:border-highlight hover:text-paper',
      )}
    >
      {children}
    </button>
  );
}

export interface EditorHeaderProps {
  canSaveNote: boolean;
  saveNoteHint: string;
  savingNote: boolean;
  onSaveNote: () => void;
  teachCut: boolean;
  teachAnimate: boolean;
  filter: ClipFilter;
  unresolvedCount: number;
  applying: boolean;
  onToggleTeach: (s: 'cut' | 'animate') => void;
  onFilter: (f: ClipFilter) => void;
  onPreview: () => void;
  onCopyAll: () => void;
  onApply: () => void;
  onClear: () => void;
}

export const EditorHeader = memo(function EditorHeader(p: EditorHeaderProps) {
  return (
    <header className="flex h-[calc(3.5rem+env(safe-area-inset-top,0px))] shrink-0 items-center gap-2 border-b border-subtle bg-panel/80 px-3 pt-[env(safe-area-inset-top,0px)] md:h-14 md:pt-0">
      <Link
        href="/"
        aria-label="Back to VOLTA OS"
        title="Back to VOLTA OS"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1 rounded-full border border-subtle font-mono text-[10.5px] text-secondary hover:border-highlight hover:text-paper md:h-7 md:w-auto md:justify-start md:rounded-md md:px-2"
      >
        <ArrowLeft size={13} /> <span className="hidden xl:inline">Back to VOLTA OS</span>
      </Link>
      <div className="flex shrink-0 items-center gap-2 pl-1 max-md:pl-0">
        <PixelMascotLogo size={22} className="max-[400px]:hidden" />
        <span className="text-[17px] font-bold tracking-tight text-paper">
          VOLTA <span className="font-doto font-extrabold text-orange">EDITOR</span>
        </span>
      </div>
      <div className="ml-auto flex min-w-0 shrink items-center gap-2 max-md:overflow-x-auto max-md:py-1 max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden">
        <TeachToggle on={p.teachCut} label="/cut" tip={TEACH_TOOLTIPS.cut} onToggle={() => p.onToggleTeach('cut')} />
        <TeachToggle on={p.teachAnimate} label="/animate" tip={TEACH_TOOLTIPS.animate} onToggle={() => p.onToggleTeach('animate')} />
        <label className="flex h-9 items-center gap-1 rounded-md md:h-7 max-md:shrink-0 border border-subtle bg-panel-elevated px-2 font-mono text-[10.5px] text-secondary" title="Filter the files on the timeline by review status">
          <span className="hidden 2xl:inline">Filter:</span>
          <select value={p.filter} onChange={(e) => p.onFilter(e.target.value as ClipFilter)} className="bg-transparent text-paper outline-none" aria-label="Clip filter">
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value} className="bg-panel">
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <HBtn onClick={p.onClear} title="Take every file off the timeline (saved notes stay on disk and reload when you reopen a file)">
          <Eraser size={12} />
        </HBtn>
        <HBtn onClick={p.onSaveNote} disabled={!p.canSaveNote || p.savingNote} title={p.saveNoteHint}>
          <FileText size={12} /> <span className="hidden min-[1620px]:inline">{p.savingNote ? 'Saving...' : 'Save notes to project'}</span>
        </HBtn>
        <HBtn onClick={p.onPreview} title="Preview the exact compiled prompt">
          <Eye size={12} /> <span className="hidden min-[1620px]:inline">Preview</span>
        </HBtn>
        <HBtn onClick={p.onApply} disabled={p.applying} title="Append the learned rules to VOLTA's WORKSPACE COPY (./workspace/skills/cut|animate/SKILL.md, not your live ~/.claude skills) and show the diff">
          <Wand2 size={12} className={p.applying ? 'robo-spin' : ''} /> <span className="hidden min-[1620px]:inline">{p.applying ? 'Applying...' : 'Apply & Teach (workspace copy)'}</span>
        </HBtn>
        <HBtn onClick={p.onCopyAll} primary title="Copy every unresolved pin + RL directives as a structured prompt">
          <ClipboardCopy size={12} />{' '}
          {/* relative: anchors the sr-only label inside the scrolling header strip so it can't widen the page. */}
          <span className="relative">
            <span className="max-md:sr-only">Copy All Comments </span>({p.unresolvedCount})
          </span>
        </HBtn>
      </div>
    </header>
  );
});
