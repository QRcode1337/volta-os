'use client';
import { Check, Dices, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ScriptHook } from './script-model';
import { fmtDur, secondsFor, wordCount } from './script-model';

interface HookLabProps {
  hooks: ScriptHook[];
  activeHookId: string;
  onSelect: (id: string) => void;
  onRegenerate: () => void;
}

function retentionColor(v: number): string {
  if (v >= 78) return '#22C55E';
  if (v >= 68) return '#F5A623';
  return '#FF5500';
}

export function HookLab({ hooks, activeHookId, onSelect, onRegenerate }: HookLabProps) {
  const tone = hooks.filter((h) => h.kind === 'tone').sort((a, b) => b.retention - a.retention);
  const wild = hooks.filter((h) => h.kind === 'wildcard');

  const renderHook = (h: ScriptHook, rank: number) => {
    const active = h.id === activeHookId;
    const color = h.kind === 'wildcard' ? '#A855F7' : retentionColor(h.retention);
    return (
      <button
        key={h.id}
        type="button"
        onClick={() => onSelect(h.id)}
        aria-pressed={active}
        className={cn(
          'group relative w-full rounded-lg border px-3 py-2.5 text-left transition-all',
          active
            ? 'border-orange bg-[rgba(255,85,0,0.07)] shadow-[0_0_0_1px_rgba(255,85,0,0.35),0_0_24px_rgba(255,85,0,0.12)]'
            : 'border-subtle bg-panel-elevated hover:border-highlight hover:bg-panel-hover',
        )}
      >
        <div className="mb-1.5 flex items-center gap-1.5">
          {h.kind === 'wildcard' ? (
            <span className="inline-flex h-[18px] items-center gap-1 rounded-full border border-purple/50 bg-purple/10 px-1.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.1em] text-purple">
              <Dices className="h-2.5 w-2.5" /> /wildcard
            </span>
          ) : (
            <span className="inline-flex h-[18px] items-center rounded-full border border-subtle bg-obsidian px-1.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.1em] text-secondary">
              /tone · #{rank}
            </span>
          )}
          <span className="truncate font-mono text-[9px] uppercase tracking-[0.08em] text-muted">{h.angle}</span>
          <span className="ml-auto flex items-center gap-1">
            {active && (
              <span className="inline-flex h-[18px] items-center gap-0.5 rounded-full bg-orange px-1.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.08em] text-obsidian">
                <Check className="h-2.5 w-2.5" strokeWidth={3} /> Active
              </span>
            )}
          </span>
        </div>
        <p className={cn('text-[12.5px] leading-snug', active ? 'text-paper' : 'text-secondary group-hover:text-paper')}>{h.text}</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-obsidian">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${h.retention}%`, background: color, boxShadow: `0 0 8px ${color}88` }} />
          </div>
          <span className="w-9 text-right font-doto text-[13px] font-bold" style={{ color }}>
            {h.retention}%
          </span>
          <span className="w-16 text-right font-mono text-[9px] text-muted">
            {wordCount(h.text)}w · {fmtDur(secondsFor(h.text))}
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="px-0.5 font-mono text-[9.5px] uppercase leading-relaxed tracking-[0.08em] text-muted">
        Predicted 30s retention · 8 corpus-aligned <span className="text-secondary">/tone</span> + 2{' '}
        <span className="text-purple">/wildcard</span>
      </p>
      {tone.map((h, i) => renderHook(h, i + 1))}
      <div className="mt-1 flex items-center gap-2">
        <span className="h-px flex-1 bg-subtle" />
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-purple">20% wildcard lane</span>
        <span className="h-px flex-1 bg-subtle" />
      </div>
      {wild.map((h, i) => renderHook(h, i + 1))}
      <button
        type="button"
        onClick={onRegenerate}
        className="mt-1 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-dashed border-purple/50 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-purple transition-colors hover:border-purple hover:bg-purple/10"
      >
        <Sparkles className="h-3.5 w-3.5" /> Regenerate wildcards
      </button>
    </div>
  );
}
