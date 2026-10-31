'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Server, TriangleAlert } from 'lucide-react';
import type { AgentHandoff, AttentionItem, FixRunResult, SystemsReport } from '@/types/systems';
import { cn } from '@/lib/cn';
import { AppTopBar } from '@/components/elements/kit/AppTopBar';
import { ToastStack, useToasts } from '@/components/elements/kit/toast';
import { copyText } from '@/components/elements/kit/clipboard';
import { useSharedJson } from '@/components/dashboard/widgets/shared-json';
import { AttentionStrip, type FixHandlers, type FixOutcome } from './AttentionStrip';
import { InventoryPanel } from './InventoryPanel';
import { MemoryGauge } from './MemoryGauge';
import { ModelsPanel } from './ModelsPanel';
import { ServiceCard } from './ServiceCard';
import { StoragePanel } from './StoragePanel';
import { formatAgo } from './format';
import { useRemoteClient } from '@/lib/remote-client';

const API_URL = '/api/systems';
const FIX_URL = '/api/systems/fix';
const POLL_MS = 30_000;
/** While folder sizes are still being measured, look again once after this long. */
const SIZES_RECHECK_MS = 10_000;

export function SystemsApp() {
  const { data, error, loading, refreshing, reload } = useSharedJson<SystemsReport>(API_URL, POLL_MS);
  const { toasts, push, dismiss } = useToasts();
  const [now, setNow] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Client clock for "x ago" labels (set after mount → hydration-safe); idles while the tab is hidden.
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 5_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (data) setNow(Date.now());
  }, [data]);

  // First visit: directory sizes come from a background du — re-check once instead of waiting a full poll.
  const sizesPending = data?.storage.sizes.status === 'pending';
  useEffect(() => {
    if (!sizesPending) return;
    const t = setTimeout(() => {
      if (!document.hidden) void reload();
    }, SIZES_RECHECK_MS);
    return () => clearTimeout(t);
  }, [sizesPending, reload]);

  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
  }, []);

  const copy = useCallback(
    async (text: string, what: string) => {
      const ok = await copyText(text);
      push(ok ? `Copied ${what} — paste it in a terminal` : 'Clipboard blocked', { tone: ok ? 'success' : 'error' });
    },
    [push],
  );

  // One-click fixes: ids go to the server, which re-derives the command / prompt from a fresh probe.
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<FixOutcome | null>(null);
  const postFix = useCallback(async <T,>(key: string, body: object): Promise<T | null> => {
    setBusy(key);
    try {
      const res = await fetch(FIX_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const json = (await res.json()) as T & { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      return json;
    } catch (err) {
      push((err as Error).message, { tone: 'error', ttl: 6_000 });
      return null;
    } finally {
      setBusy(null);
    }
  }, [push]);

  const remote = useRemoteClient();
  const fix: FixHandlers = {
    busy,
    outcome,
    remote,
    onDismiss: () => setOutcome(null),
    onRun: async (a: AttentionItem) => {
      const r = await postFix<FixRunResult>(`run:${a.id}`, { action: 'run', id: a.id });
      if (!r) return;
      setOutcome({ kind: 'run', title: a.title, result: r });
      push(r.code === 0 ? `Ran ${a.command?.label.toLowerCase() ?? 'command'} — re-probing` : `Command ${r.error ?? `exited ${r.code}`}`, { tone: r.code === 0 ? 'success' : 'error' });
      void reload();
    },
    // From the phone, Terminal would open on a Mac nobody is looking at: hand the prompt back, with "Start on Mac" as the opt-in.
    onAgent: async (a?: AttentionItem, onMac = !remote) => {
      const r = await postFix<AgentHandoff>(a ? `agent:${a.id}` : 'agent:*', { action: 'agent', ...(a ? { ids: [a.id] } : {}), open: onMac });
      if (!r) return;
      setOutcome({ kind: 'agent', result: r, item: a });
      if (!onMac) push('Fix prompt ready — copy it below', { tone: 'success' });
      else push(r.opened ? 'Claude Code opened in Terminal on the Mac — approve its steps there' : 'Couldn’t open Terminal — copy the prompt below', { tone: r.opened ? 'success' : 'error', ttl: 6_000 });
    },
  };

  const jump = useCallback((target: string) => {
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlight(target);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlight(null), 1_800);
  }, []);

  const counts = data?.counts;
  const center = counts ? (
    <div className="hidden items-center gap-1.5 whitespace-nowrap font-mono text-[10px] font-semibold uppercase tracking-[0.08em] sm:flex">
      <span className="flex h-7 items-center gap-1.5 rounded-full border border-green/35 px-2.5 text-green">
        <span className="h-1.5 w-1.5 rounded-full bg-green" /> {counts.up} up
      </span>
      {counts.degraded > 0 && (
        <span className="flex h-7 items-center gap-1.5 rounded-full border border-amber/40 px-2.5 text-amber">
          <span className="h-1.5 w-1.5 rounded-full bg-amber" /> {counts.degraded} degraded
        </span>
      )}
      {counts.down > 0 && (
        <span className="flex h-7 items-center gap-1.5 rounded-full border border-[#EF4444]/45 px-2.5 text-[#F87171]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#EF4444]" /> {counts.down} down
        </span>
      )}
    </div>
  ) : null;

  const right = (
    <>
      {data && (
        <span className="hidden whitespace-nowrap font-mono text-[10px] text-muted lg:inline" title={`Probes took ${data.durationMs} ms · server caches 15 s · page polls every 30 s while visible`}>
          probed {formatAgo(data.generatedAt, now)}
        </span>
      )}
      {error && data && (
        <span className="flex items-center gap-1 font-mono text-[10px] text-amber" title={error.message}>
          <TriangleAlert className="h-3 w-3" /> refresh failed
        </span>
      )}
      <button
        type="button"
        onClick={() => void reload()}
        title="Fetch again (the server re-probes at most every 15 s)"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-subtle bg-panel-elevated text-muted hover:text-paper"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'robo-spin')} />
      </button>
    </>
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian">
      <AppTopBar accent="Systems" subtitle="fleet health · one-click fixes" center={center} right={right} />

      <main className="hud-scroll min-h-0 flex-1 overflow-y-auto">
        {!data ? (
          <div className="flex h-full items-center justify-center p-6">
            {loading || !error ? (
              <div className="flex items-center gap-2 font-mono text-[11px] text-muted">
                <RefreshCw className="h-3.5 w-3.5 robo-spin" /> Probing services, models, storage and memory…
              </div>
            ) : (
              <div className="hud-card flex max-w-md flex-col items-center gap-3 p-6 text-center">
                <TriangleAlert className="h-5 w-5 text-[#F87171]" />
                <p className="text-[13px] text-paper">Couldn’t load system status</p>
                <p className="font-mono text-[11px] text-muted">{error.message}</p>
                <button
                  type="button"
                  onClick={() => void reload()}
                  className="mt-1 rounded-full border border-subtle bg-panel-elevated px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary hover:text-paper"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto flex max-w-[1720px] flex-col gap-5 p-4 sm:p-5">
            <AttentionStrip report={data} onCopy={copy} onJump={jump} fix={fix} />

            <section aria-label="Services" className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <Server className="h-3.5 w-3.5 text-orange" />
                <h2 className="hud-label">Services</h2>
                <span className="font-mono text-[10px] text-muted">
                  {data.services.length} probed in {data.durationMs} ms · fix from Needs attention above
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {data.services.map((s) => (
                  <ServiceCard key={s.id} s={s} onCopy={copy} highlighted={highlight === `svc-${s.id}`} />
                ))}
              </div>
            </section>

            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 2xl:grid-cols-[minmax(320px,0.85fr)_1fr_1.2fr]">
              <MemoryGauge m={data.memory} highlighted={highlight === 'memory'} />
              <ModelsPanel runtimes={data.models} now={now} highlighted={highlight === 'models'} />
              {/* lg: Storage (the tallest) spans both columns under Memory + Models instead of leaving half a row empty. */}
              <div className="min-w-0 lg:col-span-2 2xl:col-span-1">
                <StoragePanel storage={data.storage} now={now} highlighted={highlight === 'storage'} />
              </div>
            </div>

            <InventoryPanel now={now} highlighted={highlight === 'inventory'} />
          </div>
        )}
      </main>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
