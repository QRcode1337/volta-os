import 'server-only';
import type { AgentHandoff, AttentionItem, FixRunResult, SystemsReport } from '@/types/systems';
import { getSystemsReport } from './index';
import { redactSecrets } from '../redact';
import { HOME } from './run';
import { bin, run } from '../proc';
import { handoffToClaude } from '../claude';
import { HttpError } from '../http-error';

// One-click fixes for the Systems "Needs attention" list. Commands are never taken from the client: the page sends
// attention ids and everything is re-derived here from a fresh probe.
//   run   → the item's own documented command, once, in a login shell.
//   agent → a fix prompt for Claude Code. Opened as an *interactive* session in Terminal (your normal permission
//           prompts apply — nothing runs unattended), and returned so the page can copy it when you're not at the Mac.

const RUN_TIMEOUT_MS = 90_000;
const OUTPUT_TAIL = 4_000;
const SHELL = bin('zsh', ['/bin/zsh', '/bin/sh']);

const tail = (s: string, n: number) => (s.length > n ? `…${s.slice(-n)}` : s);
/** Redact line by line so a long log keeps its shape; each line is capped at 1,000 chars. */
const clean = (s: string) => tail(s.split('\n').map((l) => redactSecrets(l).slice(0, 1_000)).join('\n'), OUTPUT_TAIL);

async function pick(ids: string[]): Promise<{ report: SystemsReport; items: AttentionItem[] }> {
  const report = await getSystemsReport(true);
  const items = ids.length ? report.attention.filter((a) => ids.includes(a.id)) : report.attention;
  if (!items.length) {
    throw new HttpError(ids.length ? 'No longer in the attention list — it may already be fixed.' : 'Nothing needs attention.', 404);
  }
  return { report, items };
}

// ── Run the item's own command ───────────────────────────────────────────────────────────────────────────────────

export async function runFixCommand(id: string): Promise<FixRunResult> {
  const { items } = await pick([id]);
  const item = items[0];
  if (!item.command) throw new HttpError('This item has no command to run — hand it to an agent instead.', 400);
  const command = item.command.command;
  const t0 = Date.now();
  // Login shell so PATH matches a terminal (openclaw, launchctl, docker …).
  const r = await run(SHELL, ['-lc', command], { timeoutMs: RUN_TIMEOUT_MS, cwd: HOME });
  return { id, command, code: r.code, output: clean([r.stdout, r.stderr].filter((s) => s?.trim()).join('\n')), error: r.error, durationMs: Date.now() - t0 };
}

// ── Hand items to an agent ───────────────────────────────────────────────────────────────────────────────────────

/** Systems-specific rules on top of the shared ground rules (lib/agent-guardrails.ts). */
const FIX_RULES = [
  'Typical fixes: kickstart/reload a LaunchAgent, correct a config path, start an app, restart a container; then re-check the health endpoint / `launchctl list` / log to confirm it worked.',
  "Disk-space items: don't free space yourself. Find what is large and safe to remove (~/bin/disk-cleanup.sh without --apply is fine) and recommend it.",
  'Finish with one bullet per issue: **Fixed** / **Not fixed** / **Needs Patrick** — what you found, what you did, any command left for me.',
];

function describe(item: AttentionItem, report: SystemsReport): string {
  const svcId = item.target.startsWith('svc-') ? item.target.slice(4) : null;
  const svc = svcId ? report.services.find((s) => s.id === svcId) : null;
  const lines = [`### ${item.severity.toUpperCase()}: ${item.title}`, item.detail && `Detail: ${item.detail}`];
  if (item.command) lines.push(`Suggested command (${item.command.label}): \`${item.command.command}\`${item.command.note ? ` — ${item.command.note}` : ''}`);
  if (svc) {
    lines.push(`Service: ${svc.name} (${svc.kind}) — status ${svc.status}, ${svc.summary}${svc.endpoint ? `, probed ${svc.endpoint}` : ''}`);
    if (svc.command) lines.push(`Documented ${svc.command.label.toLowerCase()}: \`${svc.command.command}\``);
    for (const a of svc.launchAgents) {
      lines.push(`LaunchAgent ${a.label} (${a.role}): ${a.health}, last exit ${a.lastExit ?? '—'}, schedule ${a.schedule ?? '—'}${a.logPath ? `, log ${a.logPath}` : ''}`);
    }
    for (const n of svc.notes) lines.push(`Note: ${n}`);
  }
  return lines.filter(Boolean).join('\n');
}

function buildBody(items: AttentionItem[], report: SystemsReport): string {
  return [
    `VOLTA Systems flagged ${items.length} issue${items.length === 1 ? '' : 's'} on Patrick's Mac (zsh; probed ${report.generatedAt}). Diagnose and fix them.`,
    ...items.map((i) => describe(i, report)),
  ].join('\n\n');
}


/**
 * Build the fix prompt for the given attention ids (all when empty). With `open`, also start an interactive
 * `claude` session in a new Terminal window seeded with it — only possible on the Mac itself.
 */
export async function agentHandoff(ids: string[], open: boolean): Promise<AgentHandoff> {
  const { report, items } = await pick(ids);
  const titles = items.map((i) => i.title);
  const h = await handoffToClaude({ tag: 'fix', cwd: process.cwd(), body: buildBody(items, report), rules: FIX_RULES, open, log: { items: titles } });
  return { ...h, items: titles };
}
