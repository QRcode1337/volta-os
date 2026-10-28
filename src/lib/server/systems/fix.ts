import 'server-only';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import type { AgentHandoff, AttentionItem, FixRunResult, SystemsReport } from '@/types/systems';
import { getSystemsReport } from './index';
import { HOME, redact } from './run';
import { openClaudeInTerminal } from '../claude-terminal';
import { HttpError } from '../http-error';

// One-click fixes for the Systems "Needs attention" list. Commands are never taken from the client: the page sends
// attention ids and everything is re-derived here from a fresh probe.
//   run   → the item's own documented command, once, in a login shell.
//   agent → a fix prompt for Claude Code. Opened as an *interactive* session in Terminal (your normal permission
//           prompts apply — nothing runs unattended), and returned so the page can copy it when you're not at the Mac.

const RUN_TIMEOUT_MS = 90_000;
const OUTPUT_TAIL = 4_000;
const SHELL = fs.existsSync('/bin/zsh') ? '/bin/zsh' : '/bin/sh';

const tail = (s: string, n: number) => (s.length > n ? `…${s.slice(-n)}` : s);
/** Redact line by line so a long log keeps its shape (redact() also caps length). */
const clean = (s: string) => tail(s.split('\n').map((l) => redact(l, 1_000)).join('\n'), OUTPUT_TAIL);

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
  return new Promise((resolve) => {
    // Login shell so PATH matches a terminal (openclaw, launchctl, docker …).
    execFile(SHELL, ['-lc', command], { timeout: RUN_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, cwd: HOME, encoding: 'utf8' }, (err, stdout, stderr) => {
      const e = err as (NodeJS.ErrnoException & { code?: number | string; killed?: boolean }) | null;
      const code = !e ? 0 : typeof e.code === 'number' ? e.code : null;
      const error = !e ? null : e.killed ? `timed out after ${RUN_TIMEOUT_MS / 1000}s` : code === null ? redact(e.message) : null;
      resolve({ id, command, code, output: clean([stdout, stderr].filter((s) => s?.trim()).join('\n')), error, durationMs: Date.now() - t0 });
    });
  });
}

// ── Hand items to an agent ───────────────────────────────────────────────────────────────────────────────────────

const GUARDRAILS = `Ground rules (Patrick's Mac, zsh):
- Read the relevant logs and configs first, find the root cause, apply the smallest fix (kickstart/reload a LaunchAgent, correct a config path, start an app, restart a container), then re-check the health endpoint / \`launchctl list\` / log to confirm it worked.
- Ask before anything destructive: deleting or moving user data, sudo, system/security settings, credentials or .env secrets, git push, installing packages or pulling models/images.
- The boot SSD is nearly full — check \`df -h /\` before writing anything large.
- Disk-space items: don't free space yourself. Find what is large and safe to remove (~/bin/disk-cleanup.sh without --apply is fine) and recommend it.
- Finish with one bullet per issue: **Fixed** / **Not fixed** / **Needs Patrick** — what you found, what you did, any command left for me.`;

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

function buildPrompt(items: AttentionItem[], report: SystemsReport): string {
  return [
    `VOLTA Systems flagged ${items.length} issue${items.length === 1 ? '' : 's'} (probed ${report.generatedAt}). Diagnose and fix them.`,
    ...items.map((i) => describe(i, report)),
    GUARDRAILS,
  ].join('\n\n');
}


/**
 * Build the fix prompt for the given attention ids (all when empty). With `open`, also start an interactive
 * `claude` session in a new Terminal window seeded with it — only possible on the Mac itself.
 */
export async function agentHandoff(ids: string[], open: boolean): Promise<AgentHandoff> {
  const { report, items } = await pick(ids);
  const prompt = buildPrompt(items, report);
  const titles = items.map((i) => i.title);
  if (!open) return { prompt, items: titles, opened: false, error: null };

  const res = await openClaudeInTerminal(prompt, { cwd: process.cwd(), tag: 'fix' });
  return { prompt, items: titles, ...res };
}
