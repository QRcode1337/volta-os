'use client';
// Right column: the render queue (one job runs at a time) and the live log console for the selected job.
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, Loader2, Play, Square, XCircle } from 'lucide-react';
import type { JobsResponse, StudioJob } from '@/types/studio';
import { cn } from '@/lib/cn';
import { ACTIVE, ago, fmtBytes, useJobLog } from './studio-client';

const STATUS_STYLE: Record<StudioJob['status'], string> = {
  queued: 'text-muted border-subtle',
  running: 'text-orange border-orange/50 bg-orange/10',
  done: 'text-green border-green/40 bg-green/10',
  failed: 'text-[#EF4444] border-[#EF4444]/40 bg-[#EF4444]/10',
  canceled: 'text-amber border-amber/40 bg-amber/10',
  interrupted: 'text-amber border-amber/40 bg-amber/10',
};

function ProgressBar({ pct, active }: { pct: number | null; active: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-highlight">
      <div
        className={cn('h-full rounded-full bg-orange transition-[width] duration-300', pct === null && active && 'w-1/3 animate-pulse')}
        style={pct === null ? undefined : { width: `${pct}%` }}
      />
    </div>
  );
}

function JobRow({ job, selected, onSelect, onCancel, onPlay }: { job: StudioJob; selected: boolean; onSelect: () => void; onCancel: () => void; onPlay: () => void }) {
  const active = ACTIVE.has(job.status);
  const argSummary = Object.values(job.args).join(' · ');
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}
        className={cn('w-full cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors', selected ? 'border-orange/60 bg-orange/5' : 'border-subtle bg-panel hover:border-highlight')}
      >
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.06em]', STATUS_STYLE[job.status])}>
            {job.status === 'running' && <Loader2 className="mr-1 inline h-2.5 w-2.5 animate-spin" />}
            {job.status}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-paper">{job.presetId === '__compositions' ? 'List compositions' : job.presetLabel}</span>
          <span className="shrink-0 font-mono text-[10px] text-muted">{ago(job.createdAt)}</span>
        </div>
        <p className="mt-0.5 truncate text-[11.5px] text-secondary" title={argSummary}>
          {job.projectName}
          {argSummary ? ` · ${argSummary}` : ''}
        </p>
        {job.status === 'running' && (
          <div className="mt-2 space-y-1">
            <ProgressBar pct={job.progress.pct} active />
            <p className="font-mono text-[10px] text-muted">
              {job.progress.pct !== null ? `${Math.round(job.progress.pct)}% · ` : ''}
              {job.progress.label}
            </p>
          </div>
        )}
        {job.error && job.status !== 'done' && job.status !== 'canceled' && <p className="mt-1 line-clamp-2 text-[11.5px] text-[#EF4444]">{job.error}</p>}
        <div className="mt-1.5 flex items-center gap-2">
          {job.status === 'done' && job.outputId && (
            <button
              type="button"
              onClick={(e) => (e.stopPropagation(), onPlay())}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-orange/40 px-2 font-mono text-[10px] uppercase tracking-[0.05em] text-orange hover:border-orange"
            >
              <Play className="h-3 w-3" /> Play{job.outputBytes ? ` · ${fmtBytes(job.outputBytes)}` : ''}
            </button>
          )}
          {active && (
            <button
              type="button"
              onClick={(e) => (e.stopPropagation(), onCancel())}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-subtle px-2 font-mono text-[10px] uppercase tracking-[0.05em] text-secondary hover:border-[#EF4444]/60 hover:text-[#EF4444]"
            >
              <Square className="h-3 w-3" /> {job.status === 'queued' ? 'Remove' : 'Cancel'}
            </button>
          )}
          {job.status === 'done' && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-green" />}
          {job.status === 'failed' && <XCircle className="ml-auto h-3.5 w-3.5 text-[#EF4444]" />}
        </div>
      </div>
    </li>
  );
}

function lineTone(l: string): string {
  if (/^\[studio\]/.test(l)) return 'text-teal';
  if (/^\$ /.test(l)) return 'text-orange';
  if (/\b(error|failed|fatal|exception|not found|no such file|denied)\b/i.test(l)) return 'text-[#F87171]';
  if (/\bwarn(ing)?\b/i.test(l)) return 'text-amber';
  return 'text-secondary';
}

export function Console({ jobId, onCopy, onCancel }: { jobId: string | null; onCopy: (text: string, what: string) => void; onCancel: (id: string) => void }) {
  const log = useJobLog(jobId);
  const boxRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);
  const job = log.job;
  const active = !!job && ACTIVE.has(job.status);

  useEffect(() => {
    const el = boxRef.current;
    if (el && stick) el.scrollTop = el.scrollHeight;
  }, [log.lines, stick]);

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-subtle bg-obsidian">
      <div className="flex shrink-0 items-center gap-2 border-b border-subtle px-3 py-2">
        <h2 className="hud-label">Console</h2>
        {job && <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-muted">{job.presetId === '__compositions' ? 'List compositions' : job.presetLabel} · {job.projectName}</span>}
        {!job && <span className="flex-1" />}
        {active && jobId && (
          <button type="button" onClick={() => onCancel(jobId)} className="inline-flex h-6 items-center gap-1 rounded-full border border-subtle px-2 font-mono text-[10px] uppercase text-secondary hover:border-[#EF4444]/60 hover:text-[#EF4444]">
            <Square className="h-3 w-3" /> Cancel
          </button>
        )}
        <button
          type="button"
          disabled={!log.lines.length}
          onClick={() => onCopy(log.lines.map((l) => l.line).join('\n'), 'Log')}
          className="inline-flex h-6 items-center gap-1 rounded-full border border-subtle px-2 font-mono text-[10px] uppercase text-secondary hover:text-paper disabled:opacity-40"
        >
          <Copy className="h-3 w-3" /> Copy
        </button>
      </div>
      {job && log.progress && active && (
        <div className="shrink-0 space-y-1 border-b border-subtle px-3 py-2">
          <ProgressBar pct={log.progress.pct} active />
          <p className="font-mono text-[10px] text-muted">
            {log.progress.pct !== null ? `${Math.round(log.progress.pct)}% · ` : ''}
            {log.progress.label}
          </p>
        </div>
      )}
      <div
        ref={boxRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
        }}
        className="hud-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-[1.45]"
        aria-live="off"
      >
        {!jobId && <p className="text-muted">Select a job, or queue one. Output streams here live (SSE) and is saved to Windsor.</p>}
        {jobId && !log.lines.length && !log.ended && <p className="text-muted">Waiting for output...</p>}
        {log.lines.map((l) => (
          <div key={l.seq} className={cn('whitespace-pre-wrap break-all', lineTone(l.line))}>
            {l.line}
          </div>
        ))}
      </div>
    </section>
  );
}

export function QueuePanel({
  data,
  selectedJobId,
  onSelect,
  onCancel,
  onPlay,
  onCopy,
}: {
  data: JobsResponse | null;
  selectedJobId: string | null;
  onSelect: (id: string) => void;
  onCancel: (id: string) => void;
  onPlay: (job: StudioJob) => void;
  onCopy: (text: string, what: string) => void;
}) {
  const jobs = data?.jobs ?? [];
  const activeJobs = jobs.filter((j) => ACTIVE.has(j.status)).sort((a, b) => (a.status === b.status ? (a.createdAt < b.createdAt ? -1 : 1) : a.status === 'running' ? -1 : 1));
  const past = jobs.filter((j) => !ACTIVE.has(j.status));
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <section className="flex max-h-[46%] min-h-[150px] shrink-0 flex-col">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="hud-label">Queue</h2>
          <span className="rounded-full bg-panel-elevated px-1.5 font-mono text-[10px] text-muted">{activeJobs.length}</span>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.05em] text-muted">one at a time · nice 10</span>
        </div>
        <ul className="hud-scroll min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {!data && <li className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Loading...</li>}
          {data && jobs.length === 0 && <li className="text-[12.5px] text-secondary">Nothing queued. Pick a preset in the middle column and queue it.</li>}
          {activeJobs.map((j) => (
            <JobRow key={j.id} job={j} selected={selectedJobId === j.id} onSelect={() => onSelect(j.id)} onCancel={() => onCancel(j.id)} onPlay={() => onPlay(j)} />
          ))}
          {past.length > 0 && activeJobs.length > 0 && <li className="hud-label !text-muted pt-1">History</li>}
          {past.map((j) => (
            <JobRow key={j.id} job={j} selected={selectedJobId === j.id} onSelect={() => onSelect(j.id)} onCancel={() => onCancel(j.id)} onPlay={() => onPlay(j)} />
          ))}
        </ul>
      </section>
      <Console jobId={selectedJobId} onCopy={onCopy} onCancel={onCancel} />
    </div>
  );
}
