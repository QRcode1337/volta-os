'use client';
import { Copy, Terminal } from 'lucide-react';
import type { CopyCommand as CopyCommandT } from '@/types/systems';
import { cn } from '@/lib/cn';

export type OnCopy = (text: string, what: string) => void;

/** A documented command the user runs themselves — VOLTA only copies it. */
export function CopyCommand({ cmd, what, onCopy, compact = false }: { cmd: CopyCommandT; what: string; onCopy: OnCopy; compact?: boolean }) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onCopy(cmd.command, `${cmd.label.toLowerCase()} for ${what}`)}
        title={cmd.command}
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-subtle bg-panel-elevated px-2 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:border-orange/50 hover:text-paper"
      >
        <Copy className="h-3 w-3" /> Copy cmd
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onCopy(cmd.command, `${cmd.label.toLowerCase()} for ${what}`)}
          title="Copy to clipboard — VOLTA never runs it"
          className={cn(
            'group flex min-w-0 flex-1 items-center gap-2 rounded-md border border-subtle bg-obsidian px-2.5 py-1.5 text-left transition-colors hover:border-orange/50',
          )}
        >
          <Terminal className="h-3.5 w-3.5 shrink-0 text-muted group-hover:text-orange" />
          <code className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-secondary group-hover:text-paper">{cmd.command}</code>
          <span className="flex shrink-0 items-center gap-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-muted group-hover:text-orange">
            <Copy className="h-3 w-3" /> {cmd.label.replace(/ command$/i, '')}
          </span>
        </button>
      </div>
      {cmd.note && <p className="text-[10.5px] leading-snug text-muted">{cmd.note}</p>}
    </div>
  );
}
