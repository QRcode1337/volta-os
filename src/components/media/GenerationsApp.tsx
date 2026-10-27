'use client';
// Generations: real image / video (xAI Grok Imagine) and voice (ElevenLabs) generation.
// Every spend is two-step: POST /api/media/quote -> confirm dialog -> POST /api/media/generate {quoteId}.
// Files live on the Windsor drive; the gallery reads the on-disk manifest (GET /api/media/items).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, HardDrive, RefreshCw, FolderPlus } from 'lucide-react';
import type { GenItemRecord, JobState, MediaKind, MediaStatus, Quote } from '@/types/media';
import { cn } from '@/lib/cn';
import { pushToEditorInbox } from '@/lib/editor-inbox';
import { AppTopBar } from '@/components/elements/kit/AppTopBar';
import { ToastStack, useToasts } from '@/components/elements/kit/toast';
import { copyText } from '@/components/elements/kit/clipboard';
import { api, fileUrl, fmtBytes, fmtUsd, itemDurationSec } from './gen-client';
import { GenComposer, buildRequest, initialForm, type GenForm } from './GenComposer';
import { GenConfirm } from './GenConfirm';
import { ShotListPanel } from './ShotListPanel';
import { ExportDialog } from './ExportDialog';
import { GenCard, Lightbox, PendingCard, type ItemActions } from './GenGallery';
import { MediaKeyframes } from './ui';

type Filter = 'all' | MediaKind;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Video' },
  { id: 'voice', label: 'Voice' },
];
const JOB_KEY = 'volta:generations:job';

function readStoredJob(): string | null {
  try {
    return window.localStorage.getItem(JOB_KEY);
  } catch {
    return null;
  }
}
function storeJob(id: string | null) {
  try {
    if (id) window.localStorage.setItem(JOB_KEY, id);
    else window.localStorage.removeItem(JOB_KEY);
  } catch {
    // storage unavailable: resume-after-reload just won't work
  }
}

export function GenerationsApp() {
  const { toasts, push, dismiss } = useToasts();
  const [status, setStatus] = useState<MediaStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [items, setItems] = useState<GenItemRecord[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [form, setForm] = useState<GenForm | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [quote, setQuote] = useState<{ q: Quote; prompt: string } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState<{ state: JobState; label: string } | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'single' | 'shots'>('single');
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem('volta:gen:panel') === 'shots') setPanel('shots');
    } catch {
      /* private mode */
    }
  }, []);
  const choosePanel = (p: 'single' | 'shots') => {
    setPanel(p);
    try {
      window.localStorage.setItem('volta:gen:panel', p);
    } catch {
      /* private mode */
    }
  };
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const labelRef = useRef('');

  const loadStatus = useCallback(async () => {
    try {
      const s = await api<MediaStatus>('/api/media/status');
      setStatus(s);
      setStatusError(null);
      setForm((prev) => initialForm(s, prev ?? undefined));
    } catch (err) {
      setStatusError((err as Error).message);
    }
  }, []);
  const loadItems = useCallback(async () => {
    try {
      setItems((await api<{ items: GenItemRecord[] }>('/api/media/items')).items);
    } catch (err) {
      push((err as Error).message, { tone: 'error' });
    } finally {
      setItemsLoaded(true);
    }
  }, [push]);

  useEffect(() => {
    void loadStatus();
    void loadItems();
  }, [loadStatus, loadItems]);

  // ── job polling (also resumes a job after a page reload) ──
  const jobId = job?.state.id;
  const running = job?.state.status === 'running';
  useEffect(() => {
    if (!jobId || !running) return;
    let stopped = false;
    const tick = async () => {
      try {
        const s = await api<JobState>(`/api/media/job?id=${encodeURIComponent(jobId)}`);
        if (stopped) return;
        setJob({ state: s, label: labelRef.current || `${s.kind} generation` });
        if (s.status === 'done') {
          storeJob(null);
          push(`${s.items.length} ${s.kind} file${s.items.length === 1 ? '' : 's'} saved to Windsor.`, { tone: 'success' });
          void loadItems();
          void loadStatus();
          setJob(null);
        } else if (s.status === 'failed') {
          storeJob(null);
          push(s.error ?? 'Generation failed.', { tone: 'error', ttl: 12000 });
          void loadItems();
          void loadStatus();
          setJob(null);
        }
      } catch (err) {
        if (stopped) return;
        storeJob(null);
        push((err as Error).message, { tone: 'error' });
        setJob(null);
      }
    };
    const t = window.setInterval(() => void tick(), job?.state.kind === 'video' ? 4000 : 1200);
    return () => {
      stopped = true;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, running, push, loadItems, loadStatus]);

  useEffect(() => {
    const stored = readStoredJob();
    if (!stored) return;
    api<JobState>(`/api/media/job?id=${encodeURIComponent(stored)}`)
      .then((s) => {
        if (s.status === 'running') {
          labelRef.current = `${s.kind} generation (resumed)`;
          setJob({ state: s, label: labelRef.current });
        } else storeJob(null);
      })
      .catch(() => storeJob(null));
  }, []);

  // "/" focuses the prompt
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === '/' && !typing && !lightboxId && !quote) {
        e.preventDefault();
        promptRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxId, quote]);

  const patch = useCallback((p: Partial<GenForm>) => setForm((f) => (f ? { ...f, ...p } : f)), []);

  // ── step 1: quote (spends nothing) ──
  const requestQuote = useCallback(async () => {
    if (!form || quoting || job) return;
    setQuoting(true);
    try {
      const q = await api<Quote>('/api/media/quote', buildRequest(form));
      setQuote({ q, prompt: form.mode === 'voice' ? form.text : form.prompt });
    } catch (err) {
      push((err as Error).message, { tone: 'error', ttl: 9000 });
    } finally {
      setQuoting(false);
    }
  }, [form, quoting, job, push]);

  // Shot list: same step 1, with a prebuilt {kind:'shots'} body.
  const quoteBody = useCallback(
    async (body: unknown, summary: string) => {
      if (quoting || job) return;
      setQuoting(true);
      try {
        setQuote({ q: await api<Quote>('/api/media/quote', body), prompt: summary });
      } catch (err) {
        push((err as Error).message, { tone: 'error', ttl: 9000 });
      } finally {
        setQuoting(false);
      }
    },
    [quoting, job, push],
  );

  // ── step 2: confirmed -> spend ──
  const confirm = useCallback(async () => {
    if (!quote || starting) return;
    setStarting(true);
    try {
      const { jobId: id } = await api<{ jobId: string }>('/api/media/generate', { quoteId: quote.q.quoteId });
      labelRef.current = `${quote.q.count} x ${quote.q.model}`;
      storeJob(id);
      setJob({ state: { id, status: 'running', kind: quote.q.kind, startedAt: new Date().toISOString(), progress: 'starting', items: [] }, label: labelRef.current });
      setQuote(null);
    } catch (err) {
      push((err as Error).message, { tone: 'error', ttl: 9000 });
      setQuote(null);
    } finally {
      setStarting(false);
    }
  }, [quote, starting, push]);

  // ── item actions ──
  const actions: ItemActions = useMemo(
    () => ({
      onOpen: setLightboxId,
      onSend: (it) => {
        const waiting = pushToEditorInbox({
          id: `gen-${it.id}-${Date.now().toString(36)}`,
          title: it.prompt.length > 60 ? `${it.prompt.slice(0, 57)}...` : it.prompt,
          kind: it.kind === 'video' ? 'ANIMATION' : 'A-ROLL CUT',
          durationSec: itemDurationSec(it),
          source: 'generations',
          createdAt: new Date().toISOString(),
          file: it.file,
          mediaUrl: fileUrl(it.id),
        });
        push(`Sent to the VOLTA Editor inbox (${waiting} waiting).`, { tone: 'success', href: '/apps/editor', linkLabel: 'Open VOLTA Editor' });
      },
      onCopyPath: async (it) => {
        const ok = await copyText(it.file);
        push(ok ? 'Path copied.' : 'Copy failed; select the path in the preview instead.', { tone: ok ? 'success' : 'error' });
      },
      onReveal: async (it) => {
        try {
          await api('/api/media/reveal', { id: it.id });
        } catch (err) {
          push((err as Error).message, { tone: 'error' });
        }
      },
    }),
    [push],
  );

  const visible = useMemo(() => items.filter((i) => filter === 'all' || i.kind === filter), [items, filter]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, image: 0, video: 0, voice: 0 };
    for (const i of items) c[i.kind]++;
    return c;
  }, [items]);
  const lightboxItem = useMemo(() => items.find((i) => i.id === lightboxId) ?? null, [items, lightboxId]);
  const step = useCallback(
    (dir: 1 | -1) => {
      if (!lightboxId || !visible.length) return;
      const idx = visible.findIndex((i) => i.id === lightboxId);
      setLightboxId(visible[(idx + dir + visible.length) % visible.length].id);
    },
    [lightboxId, visible],
  );

  const quota = status?.elevenlabs.configured ? status.elevenlabs.quota : null;
  const showPending = !!job && (filter === 'all' || filter === job.state.kind);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-paper">
      <MediaKeyframes />
      <AppTopBar
        accent="Generations"
        subtitle="Image, video & voice · xAI + ElevenLabs"
        right={
          <>
            {status && (
              <>
                {quota && (
                  <span className="hidden items-center gap-2 lg:flex" title={`ElevenLabs ${quota.tier} plan${quota.resetsAt ? ` · resets ${new Date(quota.resetsAt).toLocaleDateString()}` : ''}`}>
                    <span className="hud-label">11Labs</span>
                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-highlight">
                      <span className="block h-full bg-purple" style={{ width: `${quota.limit ? (quota.remaining / quota.limit) * 100 : 0}%` }} />
                    </span>
                    <span className="font-mono text-[10.5px] text-secondary">
                      {quota.remaining.toLocaleString()} / {quota.limit.toLocaleString()} chars
                    </span>
                  </span>
                )}
                <SpendMeter status={status} />
                {status.storage.ok && (
                  <span className="hud-label hidden xl:inline" title={status.storage.root}>
                    <HardDrive className="mr-1 inline h-3 w-3" />
                    {fmtBytes(status.storage.freeBytes)} free
                  </span>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => {
                void loadStatus();
                void loadItems();
              }}
              aria-label="Refresh"
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-subtle px-3 font-mono text-[10px] uppercase tracking-[0.06em] text-muted hover:text-paper"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </>
        }
      />

      <section className="shrink-0 border-b border-subtle bg-panel px-4 py-3">
        {statusError && (
          <p className="rounded-md border border-[#EF4444]/40 bg-[#EF4444]/5 px-3 py-2 font-mono text-[11px] text-[#EF4444]">Could not load provider status: {statusError}</p>
        )}
        {!status && !statusError && <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Loading providers...</p>}
        {status && !status.storage.ok && (
          <p className="mb-2 flex items-start gap-2 rounded-md border border-amber/40 bg-amber/5 px-3 py-2 text-[12.5px] text-paper">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
            <span>
              {status.storage.reason} <span className="text-muted">Generation is disabled until the drive is available.</span>
            </span>
          </p>
        )}
        {status && (
          <div className="mb-2 flex items-center gap-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em]" role="tablist" aria-label="Generation mode">
            {(['single', 'shots'] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={panel === p}
                onClick={() => choosePanel(p)}
                className={panel === p ? 'h-7 rounded-md bg-orange px-2.5 text-obsidian' : 'h-7 rounded-md px-2.5 text-secondary hover:text-paper'}
              >
                {p === 'single' ? 'Single' : 'Shot list'}
              </button>
            ))}
          </div>
        )}
        {status && form && panel === 'single' && (
          <GenComposer ref={promptRef} status={status} form={form} patch={patch} busy={quoting || !!job || starting} onSubmit={() => void requestQuote()} />
        )}
        {status && panel === 'shots' && (
          <ShotListPanel
            status={status}
            items={items}
            busy={quoting || !!job || starting || !status.storage.ok}
            onQuote={(body, summary) => void quoteBody(body, summary)}
            onNotice={(text, tone) => push(text, { tone: tone ?? 'success', ttl: tone === 'error' ? 9000 : 4000 })}
          />
        )}
        {status?.elevenlabs.configured && status.elevenlabs.error && <p className="mt-2 font-mono text-[10.5px] text-amber">ElevenLabs: {status.elevenlabs.error}</p>}
        {status?.xai.configured && status.xai.imageError && <p className="mt-2 font-mono text-[10.5px] text-amber">xAI images: {status.xai.imageError}</p>}
      </section>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-subtle px-4 py-2">
        <nav className="flex flex-wrap gap-1" aria-label="Filter">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors',
                filter === f.id ? 'border-orange bg-orange/10 text-paper' : 'border-transparent text-secondary hover:border-subtle hover:text-paper',
              )}
            >
              {f.label}
              <span className="rounded-full bg-panel-elevated px-1.5 font-mono text-[10px] text-muted">{counts[f.id]}</span>
            </button>
          ))}
        </nav>
        <span className="ml-auto hidden font-mono text-[10px] uppercase tracking-[0.05em] text-muted lg:inline">
          {status?.storage.root ?? '/Volumes/Windsor/VOLTA/generations'} · manifest.jsonl
        </span>
        <button
          type="button"
          onClick={() => setExporting(true)}
          disabled={!visible.length}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-subtle px-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em] text-secondary transition-colors hover:border-orange hover:text-paper disabled:cursor-not-allowed disabled:opacity-40 lg:ml-0"
          title="Copy everything in this filter into a new folder on Windsor"
        >
          <FolderPlus className="h-3.5 w-3.5" /> Export {filter === 'all' ? 'all' : filter} ({visible.length})
        </button>
      </div>

      <main className="hud-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4">
        {itemsLoaded && visible.length === 0 && !showPending ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="font-doto text-4xl text-orange">0</p>
            <p className="text-secondary">
              {items.length === 0 ? 'Nothing generated yet. Write a prompt above; you confirm the estimated cost before anything is spent.' : 'Nothing in this filter.'}
            </p>
          </div>
        ) : (
          <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 2xl:columns-4">
            {showPending && job && <PendingCard label={job.label} progress={job.state.progress} />}
            {visible.map((it) => (
              <GenCard key={it.id} it={it} actions={actions} />
            ))}
          </div>
        )}
      </main>

      <GenConfirm quote={quote?.q ?? null} prompt={quote?.prompt ?? ''} busy={starting} onCancel={() => setQuote(null)} onConfirm={() => void confirm()} />
      <ExportDialog open={exporting} filter={filter} items={visible} onClose={() => setExporting(false)} onError={(m) => push(m, { tone: 'error', ttl: 9000 })} />
      <Lightbox item={lightboxItem} onClose={() => setLightboxId(null)} onStep={step} actions={actions} />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

export default GenerationsApp;

/** Today's spend vs the server-enforced daily cap. Visible at every width (the phone included). */
function SpendMeter({ status }: { status: MediaStatus }) {
  const s = status.spend;
  if (!s) {
    return (
      <span className="hud-label shrink-0 whitespace-nowrap !text-[#EF4444]" title="The spend ledger could not be read; paid generation is refused until it can.">
        spend unknown
      </span>
    );
  }
  const pct = s.capUsd > 0 ? Math.min(1, s.totalUsd / s.capUsd) : 1;
  const tone = pct >= 1 ? 'text-[#EF4444]' : pct >= 0.8 ? 'text-orange' : 'text-green';
  const bar = pct >= 1 ? 'bg-[#EF4444]' : pct >= 0.8 ? 'bg-orange' : 'bg-green';
  const title = [
    `Today (${s.date}): $${s.totalUsd.toFixed(2)} of the $${s.capUsd.toFixed(2)} daily cap, $${s.remainingUsd.toFixed(2)} left.`,
    `Generations $${s.generationsUsd.toFixed(2)} + podcast TTS $${s.podcastUsd.toFixed(2)} (estimates).`,
    `Per-request cap $${s.perRequestCapUsd.toFixed(2)}.`,
  ].join('\n');
  return (
    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap" title={title} aria-label={title}>
      <span className="hud-label">today</span>
      <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-highlight sm:block">
        <span className={cn('block h-full', bar)} style={{ width: `${pct * 100}%` }} />
      </span>
      <span className="font-mono text-[10.5px]">
        <span className={tone}>{fmtUsd(s.totalUsd)}</span>
        <span className="text-muted"> / {Number.isInteger(s.capUsd) ? `$${s.capUsd}` : fmtUsd(s.capUsd)}</span>
      </span>
    </span>
  );
}
