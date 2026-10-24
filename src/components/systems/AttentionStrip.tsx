'use client';
import { AlertOctagon, AlertTriangle, ArrowDownRight, CheckCircle2 } from 'lucide-react';
import type { AttentionItem, SystemsReport } from '@/types/systems';
import { cn } from '@/lib/cn';
import { CopyCommand, type OnCopy } from './CopyCommand';

export function AttentionStrip({ report, onCopy, onJump }: { report: SystemsReport; onCopy: OnCopy; onJump: (target: string) => void }) {
  const items = report.attention;
  if (!items.length) {
    return (
      <div className="flex items-center gap-2.5 rounded-[10px] border border-green/30 bg-green/[0.06] px-4 py-3">
        <CheckCircle2 className="h-4 w-4 text-green" />
        <p className="text-[12.5px] text-paper">
          All clear — {report.counts.up} of {report.services.length} services up, storage and memory within thresholds.
        </p>
      </div>
    );
  }
  const crit = items.filter((i) => i.severity === 'critical').length;
  return (
    <section aria-label="Needs attention" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="hud-label">Needs attention</h2>
        <span className="font-mono text-[10px] text-muted">
          {crit ? `${crit} critical · ` : ''}
          {items.length - crit} warning{items.length - crit === 1 ? '' : 's'}
        </span>
      </div>
      <ul className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
        {items.map((a) => (
          <Item key={a.id} a={a} onCopy={onCopy} onJump={onJump} />
        ))}
      </ul>
    </section>
  );
}

function Item({ a, onCopy, onJump }: { a: AttentionItem; onCopy: OnCopy; onJump: (target: string) => void }) {
  const critical = a.severity === 'critical';
  const Icon = critical ? AlertOctagon : AlertTriangle;
  return (
    <li
      className={cn(
        'flex items-start gap-2.5 rounded-[10px] border px-3 py-2.5',
        critical ? 'border-[#EF4444]/45 bg-[#EF4444]/[0.07]' : 'border-amber/35 bg-amber/[0.05]',
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', critical ? 'text-[#F87171]' : 'text-amber')} />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold leading-snug text-paper">{a.title}</p>
        {a.detail && <p className="mt-0.5 text-[11.5px] leading-snug text-secondary">{a.detail}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => onJump(a.target)}
          className="inline-flex h-6 items-center gap-1 rounded-full border border-subtle bg-panel-elevated px-2 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:text-paper"
        >
          <ArrowDownRight className="h-3 w-3" /> Show
        </button>
        {a.command && <CopyCommand cmd={a.command} what={a.title} onCopy={onCopy} compact />}
      </div>
    </li>
  );
}
