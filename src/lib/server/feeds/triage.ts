import 'server-only';
import type { FeedItem, FeedTriage } from './types';
import { TRIAGE_VERSION, labelOf, pruneTriage, triageState } from './store';

// Optional JEV triage (needs-action / fyi / noise). Labels are cached forever per item id in triage.json, so each
// item is classified once. Only masked text is sent. If JEV is not configured, its circuit is open or the module
// cannot be loaded, nothing happens and the feed simply has no JEV badges.

const LABELS: Record<FeedTriage, string> = {
  'needs-action':
    'A specific person (the owner) must act or decide: the text explicitly asks for approval, a decision, a login or credentials, or reports an unresolved failure, outage or security exposure that the automation cannot fix on its own.',
  fyi: 'A completed result, status update, finding, news or market signal that is worth reading but leaves nothing for the owner to do.',
  noise: 'Routine, empty or repetitive output: nothing new, a passing health check, a run with nothing to report, or a failure that is only a transient retry.',
};
/**
 * A needs-action label interrupts the owner, so it must clear a higher bar than fyi/noise. Below this, a needs-action guess
 * is stored as the likeliest other label (2026-10-28: 17 of 81 needs-action labels sat under 0.5, lowest 0.16).
 */
const NEEDS_ACTION_MIN = 0.5;
const BATCH = 32;
const MAX_BATCHES = 8; // per trigger (8 x 32 items); the next list request continues if more are waiting
const g = globalThis as unknown as { __feedsTriageRun?: { running: boolean; tried: Set<string>; warned: boolean; v: number } };
const run = () => {
  const st = (g.__feedsTriageRun ??= { running: false, tried: new Set(), warned: false, v: TRIAGE_VERSION });
  if (st.v !== TRIAGE_VERSION) Object.assign(st, { tried: new Set<string>(), v: TRIAGE_VERSION });
  return st;
};

const isLabel = (l: unknown): l is FeedTriage => l === 'needs-action' || l === 'fyi' || l === 'noise';

/** JEV's pick, with an unsure needs-action demoted to the likeliest of fyi / noise. */
function settle(choice: string | null, confidence: number, probabilities: Record<string, number>): { l: FeedTriage; c: number } | null {
  if (!isLabel(choice)) return null;
  if (choice !== 'needs-action' || confidence >= NEEDS_ACTION_MIN) return { l: choice, c: confidence };
  const fyi = probabilities.fyi ?? 0;
  const noise = probabilities.noise ?? 0;
  return fyi >= noise ? { l: 'fyi', c: fyi } : { l: 'noise', c: noise };
}

type JevModule = typeof import('@/lib/server/jev');
async function jev(): Promise<JevModule | null> {
  try {
    return await import('@/lib/server/jev');
  } catch {
    return null;
  }
}

/** `items` are the overlaid feed items: those with triageBy 'jev' are already classified, the rest without a rule label are waiting. */
export async function jevState(items: FeedItem[]): Promise<{ enabled: boolean; circuitOpen: boolean; triaged: number; pending: number }> {
  const m = await jev();
  const enabled = !!m && m.jevConfigured();
  const st = run();
  return {
    enabled,
    circuitOpen: !!m && m.jevCircuit().open,
    triaged: items.filter((i) => i.triageBy === 'jev').length,
    pending: enabled ? items.filter((i) => !i.triageBy && !st.tried.has(i.id)).length : 0,
  };
}

/** Fire-and-forget: classify the newest untriaged items. Never throws, never blocks a request. */
export function scheduleTriage(items: FeedItem[]): void {
  const st = run();
  if (st.running) return;
  st.running = true;
  void (async () => {
    try {
      const m = await jev();
      if (!m || !m.jevConfigured() || m.jevCircuit().open) return;
      for (let n = 0; n < MAX_BATCHES; n++) {
        const labels = (await triageState().get()).labels;
        const todo = items
          .filter((i) => !i.triageBy && !labelOf(labels, i.id) && !st.tried.has(i.id))
          .sort((a, b) => Date.parse(b.ranAt) - Date.parse(a.ranAt))
          .slice(0, BATCH);
        if (!todo.length) return;
        for (const i of todo) st.tried.add(i.id);
        const res = await m.triage({
          items: todo.map((i) => ({ id: i.id, text: `[${i.sourceLabel}] [${i.status}] ${i.title}\n${i.body.slice(0, 900)}` })),
          labels: LABELS,
          minConfidence: 0.34,
        });
        const at = new Date().toISOString();
        await triageState().update((d) => {
          for (const r of res.results) {
            const picked = settle(r.label ?? r.guess, r.confidence, r.probabilities);
            if (picked) d.labels[String(r.id)] = { ...picked, at, v: TRIAGE_VERSION };
          }
          pruneTriage(d.labels);
        });
        if (m.jevCircuit().open) return;
      }
    } catch (err) {
      for (const i of items) st.tried.delete(i.id); // retry later (breaker/timeouts are handled inside the JEV client)
      if (!st.warned) {
        st.warned = true;
        console.warn('[volta feeds] JEV triage unavailable:', (err as Error).message);
      }
    } finally {
      st.running = false;
    }
  })();
}
