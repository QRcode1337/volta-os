import path from 'node:path';
import type { EffortLevel, ModelTier, SkillRunRequest, SkillRunResult } from '@/types/os';
import type { RealSkill } from '@/types/sources';
import { EFFORT_LEVELS, MODEL_TIERS } from '@/lib/mock-data';
import { WORKSPACE_DIR } from '@/lib/server/workspace';
import { HttpError, route } from '@/lib/server/route-helpers';
import { JEV_OVERRIDE_THRESHOLD, hashString, resolveRoutedModel, routeAndRecord } from '@/lib/server/jev';
import { recordSkillRoute, resolveSkill } from '@/lib/server/jev/skill-routing';
import { buildMockReport } from './reports';
import { tilde } from '@/lib/server/storage';
import { ClaudeCliError, runClaudeCli } from '@/lib/server/claude';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIVE_TIMEOUT_MS = 15_000;
const MAX_CUSTOM_PROMPT = 8_000;
const COMMAND_RE = /^\/[a-z0-9][a-z0-9-]{0,47}$/;
/** Simulated runs have no measured usage; this is the generic per-run token baseline (at HIGH effort). */
const SIM_BASE_TOKENS = 40_000;
/** Tools a dashboard-triggered live run may never use, on top of read-only plan mode. */
const LIVE_DISALLOWED_TOOLS = ['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'WebSearch'].join(',');

/** Blended estimate $/MTok (mirrored in right-skills.ts RUN_RATE). Estimates, not metered spend. */
const RATE: Record<ModelTier, number> = { HAIKU: 0.55, SONNET: 4.6, OPUS: 12.5, FABLE: 21 };
const EFFORT_MULT: Record<EffortLevel, number> = { LOW: 0.55, MEDIUM: 0.8, HIGH: 1, XHIGH: 1.35, MAX: 1.8 };

function parseBody(body: unknown): SkillRunRequest | string {
  if (!body || typeof body !== 'object') return 'Body must be an object';
  const { command, model, effort, customPrompt } = body as Record<string, unknown>;
  if (typeof command !== 'string' || !COMMAND_RE.test(command)) return '`command` must look like "/skill-name"';
  if (typeof model !== 'string' || !(MODEL_TIERS as readonly string[]).includes(model)) {
    return `\`model\` must be one of ${MODEL_TIERS.join(', ')}`;
  }
  if (typeof effort !== 'string' || !(EFFORT_LEVELS as readonly string[]).includes(effort)) {
    return `\`effort\` must be one of ${EFFORT_LEVELS.join(', ')}`;
  }
  if (customPrompt !== undefined && customPrompt !== null && typeof customPrompt !== 'string') {
    return '`customPrompt` must be a string';
  }
  if (typeof customPrompt === 'string' && customPrompt.length > MAX_CUSTOM_PROMPT) {
    return `\`customPrompt\` exceeds ${MAX_CUSTOM_PROMPT} characters`;
  }
  return {
    command,
    model: model as ModelTier,
    effort: effort as EffortLevel,
    customPrompt: typeof customPrompt === 'string' && customPrompt.trim() ? customPrompt.trim() : undefined,
  };
}

function skillNote(command: string, skill: RealSkill | null, peers: string[]): string {
  if (skill?.path) return `**SKILL.md:** \`${tilde(skill.path)}\`\n\n`;
  if (skill) return `> \`${command}\` has no SKILL.md on disk (seen only in transcripts — likely a Claude Code built-in).\n\n`;
  if (peers.length) return `> \`${command}\` matches several skills (${peers.join(', ')}) — ran with the generic skill template.\n\n`;
  return `> \`${command}\` was not found in ~/.claude/skills or installed plugins — ran with the generic skill template.\n\n`;
}

const roundUsd = (n: number) => Math.round(n * 10_000) / 10_000;
const costOf = (tokens: number, tier: ModelTier) => roundUsd((tokens / 1e6) * RATE[tier]);

/** Simulated token / cost figures for a mock run (shown as SIM): generic baseline × effort, priced at RATE. */
function simulatedUsage(req: SkillRunRequest, routed: ModelTier, seed: number) {
  const jitter = 0.9 + ((seed % 1000) / 1000) * 0.2; // 0.9 – 1.1
  const extra = req.customPrompt ? Math.ceil(req.customPrompt.length / 4) : 0;
  const total = Math.round(SIM_BASE_TOKENS * EFFORT_MULT[req.effort] * jitter) + extra;
  const tokensIn = Math.round(total * 0.82);
  return { tokensIn, tokensOut: total - tokensIn, costUsd: costOf(total, routed) };
}

function buildLivePrompt(req: SkillRunRequest, skill: RealSkill | null): string {
  const source = skill?.path
    ? `Run the ${skill.id} skill as defined in ${skill.path} (read that file first; follow CLAUDE.md routing).`
    : `Run the ${req.command} skill (no SKILL.md was found on disk; use the built-in skill if one exists; follow CLAUDE.md routing).`;
  return [
    source,
    req.customPrompt ? `Task focus: ${req.customPrompt}` : '',
    'This run was triggered from the VOLTA OS dashboard as a dry run: report what you found and what you would do',
    'as concise markdown. Do not kill processes, delete or move files, send messages, or write outside ./workspace.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Live run: read-only plan mode, no shell/write/web tools and no MCP servers, regardless of the user's
 * default permission mode. The SKILL.md's folder is the only extra readable directory.
 */
async function runClaude(prompt: string, model: ModelTier, skillDir: string | null): Promise<string> {
  const cliModel = (model === 'FABLE' ? 'OPUS' : model).toLowerCase();
  const args = [
    '--model',
    cliModel,
    '--permission-mode',
    'plan',
    `--disallowedTools=${LIVE_DISALLOWED_TOOLS}`,
    '--strict-mcp-config',
    ...(skillDir ? [`--add-dir=${skillDir}`] : []),
  ];
  let stdout: string;
  try {
    // Prompt on stdin (never argv); the resolved claude binary, Max-plan env and the LLM usage log come from runClaudeCli.
    ({ stdout } = await runClaudeCli({ args, prompt, cwd: WORKSPACE_DIR, timeoutMs: LIVE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, task: 'skills:run', model: cliModel }));
  } catch (e) {
    if (!(e instanceof ClaudeCliError)) throw e;
    const d = e.detail;
    throw new Error(d.killed ? `timed out after ${LIVE_TIMEOUT_MS / 1000}s` : d.notFound ? '`claude` CLI not found (set VOLTA_CLAUDE_BIN)' : e.message);
  }
  const out = stdout.trim();
  if (!out) throw new Error('`claude -p` returned empty output');
  return out;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });

/** POST /api/skills/run  body SkillRunRequest → SkillRunResult */
export const POST = route(async ({ req, body: raw }) => {
  const started = Date.now();
  const parsed = parseBody(raw);
  if (typeof parsed === 'string') throw new HttpError(parsed, 400);
  const body = parsed;

  // 1. Jev classifies the job (recorded in telemetry) and may reroute the requested tier. The requested tier is the
  //    skill's prior: the fallback heuristic weighs it, and real JEV must clear the 0.80 gate to override it.
  const jev = await routeAndRecord(body.customPrompt ?? body.command, body.command, body.model);
  const { routed, overridden } = resolveRoutedModel(body.model, jev);
  const seed = hashString(`${body.command}|${routed}|${body.effort}|${body.customPrompt ?? ''}`);
  const { skill, peers } = await resolveSkill(body.command);
  recordSkillRoute({
    at: new Date().toISOString(),
    command: body.command,
    skillId: skill?.id ?? null,
    requested: body.model,
    picked: jev.model,
    confidence: jev.confidence,
    routed,
    overridden,
    source: jev.source,
  });

  const routeLine = overridden
    ? `Jev rerouted **${body.model} → ${routed}** (${jev.confidence.toFixed(2)} confidence · ${jev.reason})`
    : body.model === 'FABLE'
      ? `FABLE is a manual pin — Jev suggested ${jev.model} (${jev.confidence.toFixed(2)}) but did not override`
      : `Jev kept **${routed}** (suggested ${jev.model} at ${jev.confidence.toFixed(2)}; override threshold ${JEV_OVERRIDE_THRESHOLD.toFixed(2)})`;
  const header = (mode: 'live' | 'mock') =>
    `## ${body.command} — run report\n\n` +
    `**Mode:** ${mode === 'live' ? 'live (`claude -p`, plan mode)' : 'simulated'} · **Tier:** ${routed} · ${body.effort}\n\n` +
    `${routeLine}\n\n` +
    skillNote(body.command, skill, peers);

  // 2. Live mode (opt-in): real `claude -p`, falling back to the simulated report on any error.
  let liveError: string | undefined;
  if (process.env.RUBRIC_CLAUDE_LIVE === '1') {
    try {
      const prompt = buildLivePrompt(body, skill);
      const out = await runClaude(prompt, routed, skill?.path ? path.dirname(skill.path) : null);
      const tokensIn = Math.ceil(prompt.length / 4) + 2_000; // estimate: prompt + skill/router reads
      const tokensOut = Math.ceil(out.length / 4);
      const result: SkillRunResult = {
        ok: true,
        command: body.command,
        mode: 'live',
        requestedModel: body.model,
        routedModel: routed,
        effort: body.effort,
        durationMs: Date.now() - started,
        tokensIn,
        tokensOut,
        costUsd: costOf(tokensIn + tokensOut, routed), // estimate from the token estimates above
        markdown: `${header('live')}${out}\n`,
      };
      return result;
    } catch (e) {
      liveError = (e as Error).message;
    }
  }

  // 3. Mock mode: ~1.2s simulated execution with a deterministic, realistic report.
  const usage = simulatedUsage(body, routed, seed);
  const targetMs = 1_100 + (seed % 300);
  await sleep(Math.max(0, targetMs - (Date.now() - started)), req.signal);

  const fallbackNote = liveError
    ? `> **Live run failed** (${liveError}) — showing the simulated report instead.\n\n`
    : '';
  const footer =
    '\n\n---\n_Simulated run: no processes were touched and no files were created, moved or deleted. ' +
    'Token and cost figures are a generic simulated baseline, not measured. ' +
    'Set `RUBRIC_CLAUDE_LIVE=1` to execute via `claude -p` (read-only plan mode)._\n';
  const markdown =
    header('mock') +
    fallbackNote +
    buildMockReport({ command: body.command, model: routed, effort: body.effort, customPrompt: body.customPrompt, seed }) +
    footer;

  const result: SkillRunResult = {
    ok: true,
    command: body.command,
    mode: 'mock',
    requestedModel: body.model,
    routedModel: routed,
    effort: body.effort,
    durationMs: Date.now() - started,
    tokensIn: usage.tokensIn,
    tokensOut: usage.tokensOut,
    costUsd: usage.costUsd,
    markdown,
    ...(liveError ? { error: `Live mode failed, fell back to mock: ${liveError}` } : {}),
  };
  return result;
}, { json: true });
