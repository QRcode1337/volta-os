'use client';
// Small shared pieces for VOLTA Research.
import type { ReactNode } from 'react';
import { AlertTriangle, Check, Cloud, Copy, HardDrive } from 'lucide-react';
import { cn } from '@/lib/cn';
import { copyText } from '@/components/elements/kit/clipboard';
import type { Storage } from './types';

export const chip = 'rounded-full border border-subtle bg-panel-elevated px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.05em] text-secondary';
export const smallBtn =
  'inline-flex h-7 items-center gap-1.5 rounded-full border border-subtle px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-secondary transition-colors hover:border-highlight hover:text-paper disabled:opacity-40';
export const field = 'h-8 rounded-full border border-subtle bg-panel px-2.5 text-[12px] text-paper focus:border-orange/60 focus:outline-none';

export function StorageBadge({ storage }: { storage: Storage }) {
  if (storage === 'icloud')
    return (
      <span className={cn(chip, 'inline-flex items-center gap-1 border-amber/50 text-amber')}>
        <Cloud className="h-3 w-3" /> In iCloud
      </span>
    );
  if (storage === 'external')
    return (
      <span className={cn(chip, 'inline-flex items-center gap-1 border-purple/50 text-purple')} title="Only recorded by Voltamachine, under /Volumes/Voltamachina">
        <HardDrive className="h-3 w-3" /> Voltamachina
      </span>
    );
  return (
    <span className={cn(chip, 'inline-flex items-center gap-1 border-green/40 text-green')}>
      <span className="h-1.5 w-1.5 rounded-full bg-green" /> Local
    </span>
  );
}

export function ActionBadge({ action }: { action: string | null }) {
  if (!action) return null;
  const tone = action === 'escalate' ? 'border-orange/60 text-orange' : action === 'monitor' ? 'border-teal/40 text-teal' : 'text-muted';
  return <span className={cn(chip, tone)}>{action}</span>;
}

export function NoveltyChip({ value }: { value: number | null }) {
  if (value === null) return null;
  const tone = value >= 0.85 ? 'border-orange/50 text-orange' : value >= 0.7 ? 'border-amber/40 text-amber' : '';
  return <span className={cn(chip, tone)}>novelty {value.toFixed(2)}</span>;
}

export function ContradictionChip() {
  return (
    <span className={cn(chip, 'inline-flex items-center gap-1 border-[#EF4444]/50 text-[#EF4444]')}>
      <AlertTriangle className="h-3 w-3" /> contradiction
    </span>
  );
}

export function CopyButton({ text, label, onCopied, className, title }: { text: string; label: string; onCopied: (ok: boolean, what: string) => void; className?: string; title?: string }) {
  return (
    <button
      type="button"
      title={title ?? text}
      onClick={(e) => {
        e.stopPropagation();
        void copyText(text).then((ok) => onCopied(ok, label));
      }}
      className={cn(smallBtn, 'h-6 px-2.5 text-[9.5px]', className)}
    >
      <Copy className="h-3 w-3" /> {label}
    </button>
  );
}

export function Loading({ children = 'Loading...' }: { children?: ReactNode }) {
  return <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">{children}</p>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-[#EF4444]/40 bg-[#EF4444]/5 px-3 py-2 font-mono text-[11px] text-[#EF4444]">{children}</p>;
}

export function Notice({ children, tone = 'amber' }: { children: ReactNode; tone?: 'amber' | 'orange' | 'green' }) {
  return (
    <p className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-[12.5px] text-paper', tone === 'amber' ? 'border-amber/40 bg-amber/5' : tone === 'orange' ? 'border-orange/40 bg-orange/5' : 'border-green/40 bg-green/5')}>
      <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', tone === 'amber' ? 'text-amber' : tone === 'orange' ? 'text-orange' : 'text-green')} />
      <span>{children}</span>
    </p>
  );
}

export function Building({ files }: { files?: number }) {
  return (
    <Notice tone="orange">
      Building the file inventory in the background (a stat-only walk, nothing is downloaded){files ? `: ${files.toLocaleString()} files so far` : ''}. This page retries on its own.
    </Notice>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="hud-label">{title}</h3>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

export function Tick({ ok }: { ok: boolean }) {
  return ok ? <Check className="inline h-3.5 w-3.5 text-green" /> : <AlertTriangle className="inline h-3.5 w-3.5 text-amber" />;
}
