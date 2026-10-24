'use client';
import type { ReactNode } from 'react';
import { Globe } from 'lucide-react';
import type { ServiceCheck } from '@/types/systems';
import { cn } from '@/lib/cn';
import { CopyCommand, type OnCopy } from './CopyCommand';
import { AGENT_CHIP, STATUS_BORDER, STATUS_DOT, STATUS_LABEL, STATUS_TEXT, TONE_TEXT, formatBytes, formatDuration } from './format';

export function StatusDot({ status, className }: { status: ServiceCheck['status']; className?: string }) {
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', STATUS_DOT[status], status === 'down' && 'animate-pulse', className)} aria-hidden />;
}

function Row({ label, children, className, wrap }: { label: string; children: ReactNode; className?: string; wrap?: boolean }) {
  return (
    <>
      <dt className="whitespace-nowrap text-muted">{label}</dt>
      <dd className={cn('min-w-0 text-secondary', wrap ? 'break-words' : 'truncate', className)}>{children}</dd>
    </>
  );
}

export function ServiceCard({ s, onCopy, highlighted }: { s: ServiceCheck; onCopy: OnCopy; highlighted: boolean }) {
  const p = s.process;
  return (
    <article
      id={`svc-${s.id}`}
      className={cn(
        'hud-card flex scroll-mt-4 flex-col gap-3 p-3.5 transition-shadow',
        STATUS_BORDER[s.status],
        highlighted && 'ring-2 ring-orange/60',
      )}
    >
      <header className="flex items-start gap-2.5">
        <StatusDot status={s.status} className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="truncate text-[14px] font-semibold leading-tight text-paper">{s.name}</h3>
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">{s.kind}</span>
          </div>
          <p className="mt-1 text-[12px] leading-snug text-secondary">{s.summary}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 font-mono">
          <span className={cn('text-[9.5px] font-semibold uppercase tracking-[0.1em]', STATUS_TEXT[s.status])}>{STATUS_LABEL[s.status]}</span>
          {s.latencyMs != null && (
            <span className="text-[10px] text-muted" title="Probe round-trip, measured by the VOLTA server">
              {s.latencyMs} ms
            </span>
          )}
        </div>
      </header>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-[10.5px]">
        {s.endpoint && (
          <Row label="probe">
            <span className="text-secondary">{s.endpoint}</span>
            {s.bind === 'all-interfaces' && (
              <span className="ml-1.5 inline-flex items-center gap-0.5 text-amber" title="Bound to all interfaces — reachable from other machines">
                <Globe className="inline h-3 w-3" /> all ifaces
              </span>
            )}
          </Row>
        )}
        {s.version && (
          <Row label="version">
            <span className="text-paper">{s.version}</span>
            {s.versionSource && <span className="text-muted"> · {s.versionSource}</span>}
          </Row>
        )}
        {p && (
          <Row label="process" wrap>
            {p.name} · pid {p.pid}
            {p.uptimeSec != null && <> · up {formatDuration(p.uptimeSec)}</>}
            {p.rssBytes != null && <> · {formatBytes(p.rssBytes)}</>}
          </Row>
        )}
        {s.facts.map((f) => (
          <Row key={f.label} label={f.label} className={f.tone ? TONE_TEXT[f.tone] : undefined} wrap>
            {f.value}
          </Row>
        ))}
      </dl>

      {s.containers && s.containers.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md border border-subtle bg-obsidian/60 p-2">
          {s.containers.map((c) => (
            <li key={c.name} className="flex items-center gap-2 font-mono text-[10px]">
              <StatusDot status={c.state !== 'running' ? 'down' : c.health === 'unhealthy' ? 'degraded' : c.health === 'starting' ? 'degraded' : 'up'} className="h-1.5 w-1.5" />
              <span className="w-16 shrink-0 truncate text-paper">{c.service}</span>
              <span className="min-w-0 flex-1 truncate text-muted" title={c.image}>
                {c.status}
              </span>
            </li>
          ))}
        </ul>
      )}

      {s.launchAgents.length > 0 && (
        <ul className="flex flex-col gap-1">
          {s.launchAgents.map((a) => {
            const chip = AGENT_CHIP[a.health];
            return (
              <li key={a.label} className="flex items-center gap-2 font-mono text-[10px]">
                <span className="min-w-0 flex-1 truncate text-secondary" title={`${a.label} — ${a.role}${a.schedule ? ` · ${a.schedule}` : ''}${a.plist ? '' : a.appManaged ? ' · registered by its app (no plist), listed only while the app runs' : ' · no plist in ~/Library/LaunchAgents'}${a.logPath ? `\nlog: ${a.logPath}` : ''}`}>
                  {a.label}
                  <span className="text-muted"> · {a.role}</span>
                </span>
                <span
                  className={cn('shrink-0 rounded-full border px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-[0.08em]', chip.cls)}
                  title={a.lastExit != null ? `last exit status ${a.lastExit}${a.pid ? ` · pid ${a.pid}` : ''}` : undefined}
                >
                  {chip.label}
                  {a.health === 'failing' && a.lastExit != null ? ` ${a.lastExit}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {s.notes.length > 0 && (
        <ul className="flex flex-col gap-1">
          {s.notes.map((n) => (
            <li key={n} className="text-[11px] leading-snug text-muted">
              {n}
            </li>
          ))}
        </ul>
      )}

      {s.command && (
        <div className="mt-auto pt-0.5">
          <CopyCommand cmd={s.command} what={s.name} onCopy={onCopy} />
        </div>
      )}
    </article>
  );
}
