'use client';
// VOLTA Briefing: the daily two-host podcast. Episodes live on Windsor; generation is a background job
// (POST /api/podcast/generate -> poll /api/podcast/job); the private feed for Apple Podcasts is /api/podcast/feed.xml.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, HardDrive, Mic, RefreshCw } from 'lucide-react';
import type { EpisodeRecord, JobState, PodcastConfig, PodcastStatus } from '@/lib/server/podcast/types';
import { cn } from '@/lib/cn';
import { AppTopBar } from '@/components/elements/kit/AppTopBar';
import { ToastStack, useToasts } from '@/components/elements/kit/toast';
import { EpisodeView } from './EpisodeView';
import { GenerateDialog, type GenerateChoice } from './GenerateDialog';
import { JobCard } from './JobCard';
import { SubscribeCard } from './SubscribeCard';
import { TopicWeights } from './TopicWeights';
import { api, fmtBytes, fmtDay, fmtDuration, fmtUsd, researchHealth } from './podcast-client';

export function PodcastApp() {
  const { toasts, push, dismiss } = useToasts();
  const [status, setStatus] = useState<PodcastStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [choice, setChoice] = useState<GenerateChoice | null>(null);
  const [starting, setStarting] = useState(false);
  const wasRunning = useRef(false);

  const loadStatus = useCallback(async () => {
    try {
      const s = await api<PodcastStatus>('/api/podcast/status');
      setStatus(s);
      setJob(s.job);
      setStatusError(null);
    } catch (e) {
      setStatusError((e as Error).message);
    }
  }, []);
  const loadEpisodes = useCallback(async () => {
    try {
      const r = await api<{ episodes: EpisodeRecord[] }>('/api/podcast/episodes');
      setEpisodes(r.episodes);
      setSelected((cur) => cur ?? r.episodes[0]?.date ?? null);
    } catch (e) {
      push((e as Error).message, { tone: 'error' });
    } finally {
      setLoaded(true);
    }
  }, [push]);

  useEffect(() => {
    void loadStatus();
    void loadEpisodes();
  }, [loadStatus, loadEpisodes]);

  // poll the job while it runs
  const running = job?.status === 'running';
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => {
      api<{ job: JobState | null }>('/api/podcast/job').then((r) => setJob(r.job)).catch(() => {});
    }, 2000);
    return () => window.clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (running) {
      wasRunning.current = true;
      return;
    }
    if (!wasRunning.current || !job) return;
    wasRunning.current = false;
    if (job.status === 'done' && job.episode) {
      push(`Episode ${job.date} is ready (${fmtDuration(job.episode.durationSec)}, audio ${fmtUsd(job.episode.cost.ttsUsd)}).`, { tone: 'success', ttl: 9000 });
      setSelected(job.date);
      void loadEpisodes();
    } else if (job.status === 'failed') push(job.error ?? 'Generation failed.', { tone: 'error', ttl: 14000 });
    void loadStatus();
  }, [running, job, push, loadEpisodes, loadStatus]);

  const selectedEp = useMemo(() => episodes.find((e) => e.date === selected) ?? null, [episodes, selected]);
  const config: PodcastConfig | null = status?.config ?? null;

  const blockers = useMemo(() => {
    if (!status) return [] as string[];
    const b: string[] = [];
    if (!status.storage.ok) b.push(status.storage.reason ?? 'Windsor is unavailable.');
    if (!status.keys.gemini) b.push('GEMINI_API_KEY is missing from .env.local (restart the dev server after adding it).');
    if (!status.ffmpeg) b.push('ffmpeg was not found at /opt/homebrew/bin/ffmpeg.');
    return b;
  }, [status]);

  const openDialog = (date: string, force: boolean) => setChoice({ date, force, freshResearch: false });

  const start = useCallback(
    async (c: GenerateChoice) => {
      if (!status) return;
      setStarting(true);
      try {
        const r = await api<{ job: JobState }>('/api/podcast/generate', { date: c.date, force: c.force, freshResearch: c.freshResearch, confirmUsd: status.estimate.maxUsd });
        setJob(r.job);
        setChoice(null);
        push('Generation started. Research, script and voices take roughly 10 to 20 minutes.', { tone: 'success' });
      } catch (e) {
        push((e as Error).message, { tone: 'error', ttl: 10000 });
        setChoice(null);
      } finally {
        setStarting(false);
      }
    },
    [status, push],
  );

  const todayDone = status?.hasToday ?? false;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-paper">
      <AppTopBar
        accent="Briefing"
        subtitle="Daily two-host podcast · AI · UAP · quantum · physics"
        right={
          <>
            {status && (
              <>
                <span className="hud-label hidden md:inline" title={status.estimate.breakdown}>
                  per episode <span className="text-green">est. {fmtUsd(status.estimate.usd)}</span>
                </span>
                {status.storage.ok && status.storage.freeBytes !== undefined && (
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
                void loadEpisodes();
              }}
              aria-label="Refresh"
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-subtle px-3 font-mono text-[10px] uppercase tracking-[0.06em] text-muted hover:text-paper"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
            <button
              type="button"
              disabled={!status || running || blockers.length > 0}
              onClick={() => status && openDialog(status.today, todayDone)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-orange px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-obsidian disabled:opacity-40"
            >
              <Mic className="h-3.5 w-3.5" /> {running ? 'Generating' : todayDone ? 'Regenerate today' : 'Generate today'}
            </button>
          </>
        }
      />

      {(statusError || blockers.length > 0) && (
        <section className="shrink-0 space-y-2 border-b border-subtle bg-panel px-4 py-3">
          {statusError && <p className="rounded-md border border-[#EF4444]/40 bg-[#EF4444]/5 px-3 py-2 font-mono text-[11px] text-[#EF4444]">Could not load status: {statusError}</p>}
          {blockers.map((b) => (
            <p key={b} className="flex items-start gap-2 rounded-md border border-amber/40 bg-amber/5 px-3 py-2 text-[12.5px] text-paper">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
              <span>{b}</span>
            </p>
          ))}
        </section>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-y-auto lg:grid-cols-[280px_minmax(0,1fr)_330px] lg:overflow-hidden">
        <aside className="hud-scroll border-b border-subtle p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <h2 className="hud-label">Episodes</h2>
          {loaded && episodes.length === 0 && (
            <div className="mt-6 text-center">
              <p className="font-doto text-4xl text-orange">0</p>
              <p className="mt-2 text-[12.5px] text-secondary">No episodes yet. Generate today&apos;s briefing, or load the LaunchAgent for 06:00 runs.</p>
            </div>
          )}
          <ul className="mt-3 space-y-1.5">
            {episodes.map((e) => {
              const rh = researchHealth(e);
              return (
                <li key={e.date}>
                  <button
                    type="button"
                    onClick={() => setSelected(e.date)}
                    className={cn('w-full rounded-lg border px-3 py-2.5 text-left transition-colors', selected === e.date ? 'border-orange bg-orange/10' : 'border-subtle bg-panel hover:border-highlight')}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-orange">{fmtDay(e.date)}</span>
                      <span className="font-mono text-[10.5px] text-muted">{fmtDuration(e.durationSec)}</span>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-[12.5px] leading-snug text-paper">{e.title}</span>
                    <span className="mt-1 block font-mono text-[10px] text-muted">
                      {e.stories.length} stories · audio {fmtUsd(e.cost.ttsUsd)}
                    </span>
                    {rh?.degraded && (
                      <span className="mt-1 flex items-center gap-1 font-mono text-[10px] text-amber" title="Web research mostly failed for this episode; open it for the reason.">
                        <AlertTriangle className="h-3 w-3 shrink-0" /> limited research · {rh.succeeded}/{rh.attempted} topics
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <main className="hud-scroll min-w-0 p-4 lg:overflow-y-auto">
          {selectedEp && config ? (
            <EpisodeView episode={selectedEp} config={config} busy={running} onRegenerate={(d) => openDialog(d, true)} />
          ) : (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center">
              <p className="font-doto text-5xl text-orange">VOLTA</p>
              <p className="max-w-md text-secondary">Your daily briefing: web-researched, cited and voiced by two hosts. Pick an episode, or generate today&apos;s.</p>
            </div>
          )}
        </main>

        <aside className="hud-scroll space-y-4 border-t border-subtle p-4 lg:overflow-y-auto lg:border-l lg:border-t-0">
          {job && <JobCard job={job} />}
          {config && <TopicWeights config={config} onSaved={(c) => { setStatus((s) => (s ? { ...s, config: c } : s)); push('Weights saved. They apply from the next run.', { tone: 'success' }); }} onError={(m) => push(m, { tone: 'error' })} />}
          {status && <SubscribeCard baseUrl={status.publicBaseUrl} tokenOk={status.keys.feedToken} onError={(m) => push(m, { tone: 'error' })} />}
          {status && !status.keys.notion && <p className="text-[11.5px] text-muted">NOTION_TOKEN is not set, so Frontier Signal reports are skipped.</p>}
        </aside>
      </div>

      {status && <GenerateDialog choice={choice} estimate={status.estimate} busy={starting} onCancel={() => setChoice(null)} onConfirm={(c) => void start(c)} />}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

export default PodcastApp;
