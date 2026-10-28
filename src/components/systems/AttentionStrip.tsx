'use client';
import { AlertOctagon, AlertTriangle, ArrowDownRight, Bot, CheckCircle2, Copy, Monitor, Play, RefreshCw, Sparkles, X } from 'lucide-react';
import type { AgentHandoff, AttentionItem, FixRunResult, SystemsReport } from '@/types/systems';
import { cn } from '@/lib/cn';
import { CopyCommand, type OnCopy } from './CopyCommand';

/** What the fix buttons last produced, shown under the list until dismissed. */
export type FixOutcome = { kind: 'run'; title: string; result: FixRunResult } | { kind: 'agent'; result: AgentHandoff; item?: AttentionItem };

export interface FixHandlers {
  /** Key of the action in flight: `run:<id>`, `agent:<id>` or `agent:*`. */
  busy: string | null;
  onRun: (a: AttentionItem) => void;
  /** No item → every attention item in one prompt. `onMac` opens Terminal on the Mac (default: only when the page is on the Mac). */
  onAgent: (a?: AttentionItem, onMac?: boolean) => void;
  /** Page opened from the phone over the tailnet: the agent prompt is handed back instead of opening Terminal unseen. */
  remote: boolean;
  outcome: FixOutcome | null;
  onDismiss: () => void;
}

const pill =
  'inline-flex h-6 max-md:h-9 max-md:px-3 shrink-0 items-center gap-1 rounded-full border px-2 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] transition-colors disabled:opacity-50';

export function AttentionStrip({ report, onCopy, onJump, fix }: { report: SystemsReport; onCopy: OnCopy; onJump: (target: string) => void; fix: FixHandlers }) {
  const items = report.attention;
  if (!items.length) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5 rounded-[10px] border border-green/30 bg-green/[0.06] px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-green" />
          <p className="text-[12.5px] text-paper">
            All clear — {report.counts.up} of {report.services.length} services up, storage and memory within thresholds.
          </p>
        </div>
        {fix.outcome && <Outcome o={fix.outcome} onCopy={onCopy} fix={fix} />}
      </div>
    );
  }
  const crit = items.filter((i) => i.severity === 'critical').length;
  return (
    <section aria-label="Needs attention" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="hud-label">Needs attention</h2>
        <span className="font-mono text-[10px] text-muted">
          {crit ? `${crit} critical · ` : ''}
          {items.length - crit} warning{items.length - crit === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={() => fix.onAgent()}
          disabled={!!fix.busy}
          title={fix.remote ? 'One fix prompt for every item below, to copy into Claude or start on the Mac' : 'Open Claude Code in Terminal with every item below in one fix prompt (you approve each step)'}
          className={cn(pill, 'ml-auto h-7 border-teal/60 bg-teal/10 px-3 text-teal hover:border-teal hover:bg-teal/20')}
        >
          {fix.busy === 'agent:*' ? <RefreshCw className="h-3 w-3 robo-spin" /> : <Sparkles className="h-3 w-3" />} Fix all with agent
        </button>
      </div>
      <ul className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
        {items.map((a) => (
          <Item key={a.id} a={a} onCopy={onCopy} onJump={onJump} fix={fix} />
        ))}
      </ul>
      {fix.outcome && <Outcome o={fix.outcome} onCopy={onCopy} fix={fix} />}
    </section>
  );
}

function Item({ a, onCopy, onJump, fix }: { a: AttentionItem; onCopy: OnCopy; onJump: (target: string) => void; fix: FixHandlers }) {
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
        <div className="mt-2 flex flex-wrap gap-1.5">
          {a.command && (
            <button
              type="button"
              onClick={() => fix.onRun(a)}
              disabled={!!fix.busy}
              title={`Run: ${a.command.command}`}
              className={cn(pill, 'border-subtle bg-panel-elevated text-secondary hover:border-orange/50 hover:text-paper')}
            >
              {fix.busy === `run:${a.id}` ? <RefreshCw className="h-3 w-3 robo-spin" /> : <Play className="h-3 w-3" />} Run {a.command.label.replace(/ command$/i, '').toLowerCase()}
            </button>
          )}
          <button
            type="button"
            onClick={() => fix.onAgent(a)}
            disabled={!!fix.busy}
            title={fix.remote ? 'Fix prompt for this item, to copy into Claude or start on the Mac' : 'Open Claude Code in Terminal with a fix prompt for this item (you approve each step)'}
            className={cn(pill, 'border-teal/50 bg-teal/[0.08] text-teal hover:border-teal hover:bg-teal/15')}
          >
            {fix.busy === `agent:${a.id}` ? <RefreshCw className="h-3 w-3 robo-spin" /> : <Bot className="h-3 w-3" />} Fix with agent
          </button>
          <button type="button" onClick={() => onJump(a.target)} className={cn(pill, 'border-subtle bg-panel-elevated text-secondary hover:text-paper')}>
            <ArrowDownRight className="h-3 w-3" /> Show
          </button>
          {a.command && <CopyCommand cmd={a.command} what={a.title} onCopy={onCopy} compact />}
        </div>
      </div>
    </li>
  );
}

function Outcome({ o, onCopy, fix }: { o: FixOutcome; onCopy: OnCopy; fix: FixHandlers }) {
  const onDismiss = fix.onDismiss;
  let onMac: (() => void) | null = null;
  let head;
  let body: string;
  let copy: { text: string; what: string; label: string };
  if (o.kind === 'run') {
    const r = o.result;
    const ok = r.code === 0;
    head = (
      <>
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', ok ? 'bg-green' : 'bg-[#EF4444]')} />
        <span className="min-w-0 truncate">
          {o.title} · <code className="text-secondary">{r.command}</code> · {r.error ?? `exit ${r.code}`} · {(r.durationMs / 1000).toFixed(1)}s
        </span>
      </>
    );
    body = r.output || '(no output)';
    copy = { text: r.output, what: 'command output', label: 'Copy output' };
  } else {
    const r = o.result;
    head = (
      <>
        <Bot className="h-3.5 w-3.5 shrink-0 text-orange" />
        <span className="min-w-0 truncate">
          {r.opened ? 'Claude Code opened in Terminal on your Mac' : r.error ? `Couldn’t open Terminal (${r.error}) — copy the prompt` : fix.remote ? 'Fix prompt ready — copy it into Claude, or start it on the Mac' : 'Fix prompt ready — paste it into Claude'} ·{' '}
          {r.items.length} item{r.items.length === 1 ? '' : 's'}
        </span>
      </>
    );
    body = r.prompt;
    copy = { text: r.prompt, what: 'agent fix prompt', label: 'Copy prompt' };
    if (!r.opened && fix.remote) onMac = () => fix.onAgent(o.item, true);
  }
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-subtle bg-panel px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-paper">
        {head}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => onCopy(copy.text, copy.what)} className={cn(pill, 'border-orange/50 bg-orange/[0.08] text-orange hover:border-orange')}>
            <Copy className="h-3 w-3" /> {copy.label}
          </button>
          {onMac && (
            <button
              type="button"
              onClick={onMac}
              disabled={!!fix.busy}
              title="Open Claude Code in Terminal on the Mac with this prompt, to approve there later"
              className={cn(pill, 'border-subtle bg-panel-elevated text-secondary hover:text-paper')}
            >
              {fix.busy?.startsWith('agent:') ? <RefreshCw className="h-3 w-3 robo-spin" /> : <Monitor className="h-3 w-3" />} Start on Mac
            </button>
          )}
          <button type="button" onClick={onDismiss} aria-label="Dismiss" className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:text-paper">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <pre className="hud-scroll max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-subtle bg-obsidian p-2.5 font-mono text-[10.5px] leading-relaxed text-secondary">
        {body}
      </pre>
    </div>
  );
}
