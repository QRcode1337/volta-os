import 'server-only';
import type { NotionPageDoc } from '@/types/notion';
import type { Reco, RecoSignal, RecosPayload } from '@/types/recos';
import { stripMd } from '@/lib/notion-md';
import { cached, type CachedOptions } from '../sources/cache';
import { getMemorySources } from '../sources';
import { getRoutines } from '../sources/routines';
import { getSystemsReport } from '../systems';
import { getCatalog } from '../notion/catalog';
import { NotionError } from '../notion/client';
import { getPage } from '../notion/pages';

// Weekly recos from real signals only. Nothing here estimates token or dollar savings: a card carries what its source
// measured (evidence), what to do (steps) and where it came from (source link).

const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const SECTION_RE = /apply|applied|next steps?|checklist|iteration|action items?|to-?do|what to (steal|do)|steps/i;

interface StepList {
  from: string | null;
  items: string[];
}

/** Notion exports a numbered list item as "1. 1." with its text on the next, indented line: put them back together. */
function normalize(md: string): string[] {
  const lines = md.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)((?:[-*]|\d+\.))\s+(?:\d+\.|•)\s*$/);
    if (m && i + 1 < lines.length && lines[i + 1].trim()) {
      out.push(`${m[1]}${m[2]} ${lines[i + 1].trim()}`);
      i++;
    } else out.push(lines[i]);
  }
  return out;
}

/** Items under a "checklist / next steps / apply" heading, else unchecked to-dos, else a closing numbered list. Capped. */
export function extractSteps(page: NotionPageDoc): StepList {
  const clean = (l: string) => cap(stripMd(l.replace(/^\s*([-*]|\d+\.)\s+(\[[ xX]\]\s+)?/, '')).trim(), 220);
  const isItem = (l: string) => /^\s*([-*]|\d+\.)\s+\S/.test(l);
  const take = (lines: string[]) => lines.filter(isItem).map(clean).filter((t) => t.length > 8).slice(0, 6);
  for (const s of page.sections) {
    if (!SECTION_RE.test(s.title)) continue;
    const items = take(normalize(s.markdown));
    if (items.length) return { from: s.title, items };
  }
  const lines = normalize(page.markdown);
  const at = lines.findIndex((l) => /^#{1,4}\s+.*(checklist|next steps?)/i.test(l));
  if (at >= 0) {
    const block: string[] = [];
    for (const l of lines.slice(at + 1)) {
      if (/^#{1,4}\s/.test(l)) break;
      block.push(l);
    }
    const items = take(block);
    if (items.length) return { from: stripMd(lines[at].replace(/^#+\s*/, '')), items };
  }
  const todos = lines.filter((l) => /^\s*- \[ \]\s+\S/.test(l)).map(clean).filter(Boolean).slice(0, 6);
  if (todos.length) return { from: null, items: todos };
  // a numbered checklist that closes the page (no heading of its own)
  const tail = lines.slice(-80).filter((l) => /^\d+\.\s+\S/.test(l)).map(clean).filter((t) => t.length > 12);
  const dedup = tail.filter((t, i) => tail.indexOf(t) === i);
  return dedup.length >= 3 ? { from: 'the closing checklist', items: dedup.slice(0, 6) } : { from: null, items: [] };
}

async function notionRecos(now: string): Promise<{ recos: Reco[]; signal: RecoSignal }> {
  try {
    const cat = await getCatalog();
    const items = cat.groups.filter((g) => g.kind === 'playbooks').flatMap((g) => g.items);
    const recos: Reco[] = [];
    let unreadable = 0;
    for (const it of items) {
      let page: NotionPageDoc;
      try {
        page = await getPage(it.id);
      } catch (err) {
        if (err instanceof NotionError && err.noAccess) {
          unreadable++;
          continue;
        }
        throw err;
      }
      const operative = /operative/i.test(it.section ?? '');
      const found = extractSteps(page);
      const steps = found.items.length ? [...(found.from ? [`Work from “${cap(found.from, 80)}” on the page:`] : []), ...found.items] : [];
      recos.push({
        id: `notion:${it.id}`,
        bucket: 'Content',
        priority: operative,
        severity: operative ? 'warn' : 'info',
        title: cap(stripMd(page.title), 90),
        why: operative
          ? 'Listed under OPERATIVE ACTION ITEMS in your Video Production index, so it is meant to be acted on.'
          : 'A playbook in your Video Production index. Apply what it says to the next video instead of letting it sit.',
        evidence: [
          { label: 'kind', value: operative ? 'operative action item' : 'playbook' },
          { label: 'sections', value: String(page.sections.length) },
          ...(found.items.length ? [{ label: 'steps found', value: String(found.items.length) }] : []),
          ...(page.lastEdited ? [{ label: 'edited', value: page.lastEdited.slice(0, 10) }] : []),
        ],
        steps: steps.length ? steps : ['Open the page, pick the one change that applies to the next episode, and write it into that episode’s outline.'],
        command: null,
        source: { label: 'Open in Notion', href: page.url, external: true },
        observedAt: now,
      });
    }
    return {
      recos,
      signal: { id: 'notion', label: 'Video Production (Notion)', status: 'ok', count: recos.length, detail: `${items.length} action/playbook pages${unreadable ? ` · ${unreadable} not shared with the VOLTA integration` : ''}` },
    };
  } catch (err) {
    return { recos: [], signal: { id: 'notion', label: 'Video Production (Notion)', status: 'error', count: 0, detail: (err as Error).message } };
  }
}

async function routineRecos(now: string): Promise<{ recos: Reco[]; signal: RecoSignal }> {
  try {
    const all = await getRoutines();
    const bad = all.filter((r) => r.health === 'failing' || r.health === 'stopped');
    const recos = bad.map((r): Reco => {
      const label = r.id.replace(/^launchd:/, '');
      const launchd = r.source === 'launchd';
      return {
        id: `routine:${r.id}`,
        bucket: 'Routines',
        priority: true,
        severity: 'warn',
        title: `${r.health === 'failing' ? 'Fix failing routine' : 'Routine stopped'}: ${r.name}`,
        why: r.lastError ? `${launchd ? 'LaunchAgent' : 'OpenClaw job'} reports: ${r.lastError}.` : `${r.name} is ${r.health}.`,
        evidence: [
          { label: 'schedule', value: r.schedule },
          ...(r.exitCode !== null ? [{ label: 'last exit', value: String(r.exitCode) }] : []),
          ...(r.consecutiveErrors ? [{ label: 'consecutive errors', value: String(r.consecutiveErrors) }] : []),
          ...(r.lastRunAt ? [{ label: 'last run', value: r.lastRunAt.slice(0, 16).replace('T', ' ') }] : []),
          ...(r.logUpdatedAt ? [{ label: 'log updated', value: r.logUpdatedAt.slice(0, 16).replace('T', ' ') }] : []),
        ],
        steps: launchd
          ? [`Read the job’s log and the reason for exit status ${r.exitCode ?? '?'}.`, 'Fix the cause (missing path, unmounted drive, expired token), then kick it once and confirm it exits 0.']
          : ['Open the job’s last run output in OpenClaw, fix the cause, then run it once and confirm the status turns ok.'],
        command: launchd ? `launchctl list ${label}` : 'openclaw cron list',
        source: { label: 'Open Systems', href: '/apps/systems', external: false },
        observedAt: now,
      };
    });
    return { recos, signal: { id: 'routines', label: 'Routines (/api/routines)', status: 'ok', count: recos.length, detail: `${all.length} routines read · ${bad.length} failing or stopped` } };
  } catch (err) {
    return { recos: [], signal: { id: 'routines', label: 'Routines (/api/routines)', status: 'error', count: 0, detail: (err as Error).message } };
  }
}

async function systemsRecos(now: string, routineLabels: Set<string>): Promise<{ recos: Reco[]; signal: RecoSignal }> {
  try {
    const rep = await getSystemsReport();
    const recos: Reco[] = [];
    for (const a of rep.attention) {
      // a failing LaunchAgent is already a Routines card; do not show the same fault twice
      if (a.id.startsWith('agent:') && routineLabels.has(a.id.slice('agent:'.length))) continue;
      const disk = a.id.startsWith('vol:');
      const mem = /memory|swap|ram/i.test(a.id + a.title);
      recos.push({
        id: `systems:${a.id}`,
        bucket: 'Systems',
        priority: a.severity === 'critical',
        severity: a.severity,
        title: a.title,
        why: a.detail,
        evidence: [{ label: 'severity', value: a.severity }, { label: 'checked', value: rep.generatedAt.slice(0, 16).replace('T', ' ') }],
        steps: disk
          ? ['Find what grew: list the largest top-level folders on that volume.', 'Offload bulky outputs to a drive with room, or delete what is no longer needed. Verify before deleting.']
          : mem
            ? ['Find the processes holding the memory and quit or restart the heaviest ones you do not need.']
            : ['Open Systems, read the card this item points at, and apply the fix it suggests.'],
        command: a.command?.command ?? (disk ? 'df -h' : null),
        source: { label: 'Open Systems', href: '/apps/systems', external: false },
        observedAt: now,
      });
    }
    return { recos, signal: { id: 'systems', label: 'Systems (/api/systems)', status: 'ok', count: recos.length, detail: `${rep.attention.length} attention items · ${rep.counts.down} service(s) down` } };
  } catch (err) {
    return { recos: [], signal: { id: 'systems', label: 'Systems (/api/systems)', status: 'error', count: 0, detail: (err as Error).message } };
  }
}

async function memoryRecos(now: string): Promise<{ recos: Reco[]; signal: RecoSignal }> {
  try {
    const sources = await getMemorySources();
    const recos: Reco[] = [];
    for (const s of sources) {
      const waiting = s.metrics?.find((m) => /waiting/i.test(m.label))?.value ?? 0;
      const sick = s.status === 'stale' || s.status === 'offline';
      if (!(s.id === 'pieces-vault' ? waiting > 0 || sick : sick)) continue;
      recos.push({
        id: `memory:${s.id}`,
        bucket: 'Memory',
        priority: s.id === 'pieces-vault' && waiting > 0,
        severity: s.status === 'offline' ? 'critical' : 'warn',
        title: s.id === 'pieces-vault' ? 'Clear the Pieces-Vault ingest backlog' : `${s.name} is ${s.status}`,
        why: s.detail,
        evidence: [{ label: 'status', value: s.status }, ...(s.metrics ?? []).slice(0, 4).map((m) => ({ label: m.label, value: m.value.toLocaleString('en-US') }))],
        steps: [s.setupHint ?? 'Open the source, read the last error, and fix it.', ...(s.id === 'pieces-vault' ? ['After fixing it, kick the ingest once and confirm “captures waiting” drops.'] : [])],
        command: s.id === 'pieces-vault' ? 'tail -n 40 ~/Library/Logs/ltm-ingest.log' : null,
        source: s.href ? { label: s.external ? 'Open source' : 'Open in VOLTA', href: s.href, external: !!s.external } : { label: 'Open Systems', href: '/apps/systems', external: false },
        observedAt: now,
      });
    }
    return { recos, signal: { id: 'sources', label: 'Memory sources (/api/sources)', status: 'ok', count: recos.length, detail: `${sources.length} sources read` } };
  } catch (err) {
    return { recos: [], signal: { id: 'sources', label: 'Memory sources (/api/sources)', status: 'error', count: 0, detail: (err as Error).message } };
  }
}

async function build(): Promise<RecosPayload> {
  const now = new Date().toISOString();
  const [notion, routines, memory] = await Promise.all([notionRecos(now), routineRecos(now), memoryRecos(now)]);
  const labels = new Set(routines.recos.map((r) => r.id.replace(/^routine:launchd:/, '')));
  const systems = await systemsRecos(now, labels);
  const rank = { critical: 0, warn: 1, info: 2 } as const;
  const recos = [...routines.recos, ...systems.recos, ...memory.recos, ...notion.recos].sort((a, b) => Number(b.priority) - Number(a.priority) || rank[a.severity] - rank[b.severity]);
  return { recos, signals: [notion.signal, routines.signal, systems.signal, memory.signal], generatedAt: now };
}

/** 2 minutes: the Systems probes take ~5 s and Notion pages are cached separately for 10 minutes. */
export function getRecos(opts: Pick<CachedOptions, 'force' | 'minForceMs'> = {}): Promise<RecosPayload> {
  return cached('recos:payload', 120_000, build, { maxStaleMs: 30 * 60_000, ...opts });
}
