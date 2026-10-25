'use client';
import { Check, Loader2, X } from 'lucide-react';
import { STAGES, type JobState } from '@/lib/server/podcast/types';
import { cn } from '@/lib/cn';
import { fmtSecs } from './podcast-client';

const LABEL: Record<string, string> = { gather: 'Sources', research: 'Research', rank: 'Rank', script: 'Script', tts: 'Voices', assemble: 'Master', store: 'Save' };

/** Live pipeline progress: one row per stage with its duration. */
export function JobCard({ job }: { job: JobState }) {
  const byStage = new Map(job.timings.map((t) => [t.stage, t]));
  const running = job.status === 'running';
  return (
    <section className={cn('rounded-lg border bg-panel p-4', job.status === 'failed' ? 'border-[#EF4444]/50' : running ? 'border-orange/50' : 'border-subtle')}>
      <div className="flex items-center justify-between">
        <h2 className="hud-label !text-orange">{running ? 'Generating' : job.status === 'failed' ? 'Last run failed' : 'Last run'}</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted">
          {job.date} · {job.trigger}
        </span>
      </div>
      <ol className="mt-3 space-y-1.5">
        {STAGES.map((s) => {
          const t = byStage.get(s);
          const active = running && job.stage === s;
          const done = !!t && t.endedAt !== null;
          return (
            <li key={s} className="flex items-baseline gap-2 text-[12px]">
              <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {active ? <Loader2 className="h-3.5 w-3.5 animate-spin text-orange" /> : done ? <Check className="h-3.5 w-3.5 text-green" /> : <span className="h-1.5 w-1.5 rounded-full bg-highlight" />}
              </span>
              <span className={cn('w-16 shrink-0', active ? 'text-paper' : done ? 'text-secondary' : 'text-muted')}>{LABEL[s]}</span>
              <span className="min-w-0 flex-1 truncate text-muted" title={t?.note}>
                {t?.note ?? ''}
              </span>
              <span className="shrink-0 font-mono text-[10.5px] text-muted">{t ? fmtSecs(t.ms) : ''}</span>
            </li>
          );
        })}
      </ol>
      {running && <p className="mt-3 truncate font-mono text-[10.5px] text-secondary">{job.detail}</p>}
      {job.error && (
        <p className="mt-3 flex items-start gap-1.5 text-[12px] text-[#EF4444]">
          <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{job.error}</span>
        </p>
      )}
      {job.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-subtle/60 pt-3">
          {job.warnings.map((w) => (
            <li key={w} className="text-[11.5px] leading-snug text-amber">
              {w}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
