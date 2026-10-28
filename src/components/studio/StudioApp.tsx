'use client';
// VOLTA Studio: render queue for the user's real video projects (HyperFrames, Remotion, ffmpeg) plus a Flow tab.
// Left: projects. Centre: presets, compositions, outputs + player. Right: queue and live log console.
// Everything runs through POST /api/studio/jobs {projectId, presetId, args}: presets only, one job at a time.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, HardDrive, RefreshCw } from 'lucide-react';
import type { JobsResponse, StudioJob, StudioOutput, StudioProject, StudioStorage } from '@/types/studio';
import { cn } from '@/lib/cn';
import { pushToEditorInbox } from '@/lib/editor-inbox';
import { AppTopBar } from '@/components/elements/kit/AppTopBar';
import { ToastStack, useToasts } from '@/components/elements/kit/toast';
import { copyText } from '@/components/elements/kit/clipboard';
import { FlowPanel } from './FlowPanel';
import { ProjectPanel, type Prefill } from './ProjectPanel';
import { QueuePanel } from './QueuePanel';
import { ACTIVE, KIND_COLOR, api, fmtBytes } from './studio-client';
import { makeInboxItem } from '@/lib/media-ids';

type Tab = 'render' | 'flow';
interface ProjectsData {
  projects: StudioProject[];
  configErrors: string[];
  storage: StudioStorage;
}
type OutputsData = { items: StudioOutput[]; total: number };

const PROJECT_KEY = 'volta:studio:project';
const TABS: { id: Tab; label: string }[] = [
  { id: 'render', label: 'Render' },
  { id: 'flow', label: 'Flow' },
];

function readStored(): string | null {
  try {
    return window.localStorage.getItem(PROJECT_KEY);
  } catch {
    return null;
  }
}
function store(id: string) {
  try {
    window.localStorage.setItem(PROJECT_KEY, id);
  } catch {
    // storage unavailable: selection just is not remembered
  }
}

export function StudioApp() {
  const { toasts, push, dismiss } = useToasts();
  const [tab, setTab] = useState<Tab>('render');
  const [data, setData] = useState<ProjectsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [presetByProject, setPresetByProject] = useState<Record<string, string>>({});
  const [jobs, setJobs] = useState<JobsResponse | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Record<string, OutputsData>>({});
  const [outputsLoading, setOutputsLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const prevStatus = useRef<Map<string, StudioJob['status']>>(new Map());
  const firstJobsLoad = useRef(true);

  const loadProjects = useCallback(async () => {
    try {
      const d = await api<ProjectsData>('/api/studio/projects');
      setData(d);
      setLoadError(null);
      setProjectId((cur) => {
        if (cur && d.projects.some((p) => p.id === cur)) return cur;
        const stored = readStored();
        if (stored && d.projects.some((p) => p.id === stored)) return stored;
        return (d.projects.find((p) => p.presets.length > 0 && p.exists) ?? d.projects[0])?.id ?? null;
      });
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, []);

  const loadOutputs = useCallback(
    async (id: string, refresh = false) => {
      setOutputsLoading(true);
      try {
        const o = await api<OutputsData>(`/api/studio/outputs?projectId=${encodeURIComponent(id)}${refresh ? '&refresh=1' : ''}`);
        setOutputs((cur) => ({ ...cur, [id]: o }));
      } catch (err) {
        push((err as Error).message, { tone: 'error' });
      } finally {
        setOutputsLoading(false);
      }
    },
    [push],
  );

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!projectId) return;
    store(projectId);
    void loadOutputs(projectId);
  }, [projectId, loadOutputs]);

  // ── job polling: fast while something is active, slow otherwise; paused in a hidden tab ──
  const anyActive = !!jobs?.jobs.some((j) => ACTIVE.has(j.status));
  const pollJobs = useCallback(async () => {
    try {
      const d = await api<JobsResponse>('/api/studio/jobs');
      setJobs(d);
      const prev = prevStatus.current;
      for (const j of d.jobs) {
        const before = prev.get(j.id);
        if (!firstJobsLoad.current && before && ACTIVE.has(before) && !ACTIVE.has(j.status)) {
          const name = j.presetId === '__compositions' ? 'Compositions listing' : `${j.presetLabel} (${j.projectName})`;
          if (j.status === 'done') {
            push(`${name} finished.`, { tone: 'success' });
            void loadOutputs(j.projectId, true);
            if (j.presetId === '__compositions') void loadProjects();
          } else if (j.status === 'failed') push(`${name} failed: ${j.error ?? 'see the console'}`, { tone: 'error', ttl: 10000 });
          else if (j.status === 'canceled') push(`${name} canceled.`);
        }
        prev.set(j.id, j.status);
      }
      firstJobsLoad.current = false;
    } catch {
      // transient (dev server hot reload): the next tick retries
    }
  }, [push, loadOutputs, loadProjects]);

  useEffect(() => {
    void pollJobs();
    const t = window.setInterval(() => {
      if (!document.hidden) void pollJobs();
    }, anyActive ? 1500 : 6000);
    return () => window.clearInterval(t);
  }, [pollJobs, anyActive]);

  // On first load, show the newest job's log.
  useEffect(() => {
    if (!selectedJobId && jobs?.jobs.length) setSelectedJobId(jobs.jobs.find((j) => ACTIVE.has(j.status))?.id ?? jobs.jobs[0].id);
  }, [jobs, selectedJobId]);

  const project = useMemo(() => data?.projects.find((p) => p.id === projectId) ?? null, [data, projectId]);
  const ffmpegProject = useMemo(() => data?.projects.find((p) => p.id === 'ffmpeg-tools') ?? null, [data]);

  const copy = useCallback(
    async (text: string, what: string) => {
      const ok = await copyText(text);
      push(ok ? `${what} copied.` : 'Copy failed.', { tone: ok ? 'success' : 'error' });
    },
    [push],
  );

  const submit = useCallback(
    async (presetId: string, args: Record<string, unknown>) => {
      if (!projectId || submitting) return;
      setSubmitting(true);
      try {
        const { job } = await api<{ job: StudioJob }>('/api/studio/jobs', { projectId, presetId, args });
        setSelectedJobId(job.id);
        push(`Queued ${job.presetLabel}.`, { tone: 'success' });
        await pollJobs();
      } catch (err) {
        push((err as Error).message, { tone: 'error', ttl: 9000 });
      } finally {
        setSubmitting(false);
      }
    },
    [projectId, submitting, push, pollJobs],
  );

  const cancel = useCallback(
    async (id: string) => {
      try {
        await api(`/api/studio/jobs/${encodeURIComponent(id)}/cancel`, {});
        await pollJobs();
      } catch (err) {
        push((err as Error).message, { tone: 'error' });
      }
    },
    [push, pollJobs],
  );

  const listCompositions = useCallback(async () => {
    if (!projectId) return;
    try {
      const { job } = await api<{ job: StudioJob }>('/api/studio/compositions', { projectId });
      setSelectedJobId(job.id);
      push('Queued the compositions listing (slow: it bundles the project).');
      await pollJobs();
    } catch (err) {
      push((err as Error).message, { tone: 'error', ttl: 9000 });
    }
  }, [projectId, push, pollJobs]);

  const sendToEditor = useCallback(
    (o: StudioOutput) => {
      const waiting = pushToEditorInbox(
        makeInboxItem({ source: 'studio', ref: o.id, title: o.name.replace(/\.[^.]+$/, ''), kind: 'ANIMATION', durationSec: o.durationSec ?? 3, media: { id: o.id, path: o.path } }),
      );
      push(`Sent to the VOLTA Editor inbox (${waiting} waiting).`, { tone: 'success', href: '/apps/editor', linkLabel: 'Open VOLTA Editor' });
    },
    [push],
  );

  const quickAction = useCallback(
    (o: StudioOutput, presetId: 'trim' | 'vertical-9x16' | 'mux-audio') => {
      if (!ffmpegProject) return;
      setProjectId(ffmpegProject.id);
      setPresetByProject((m) => ({ ...m, [ffmpegProject.id]: presetId }));
      setPrefill({ presetId, args: presetId === 'mux-audio' ? { audio: o.id } : { in: o.id } });
    },
    [ffmpegProject],
  );

  const playJob = useCallback(
    (j: StudioJob) => {
      if (!j.outputId) return;
      setProjectId(j.projectId);
      setPlayingId(j.outputId);
      void loadOutputs(j.projectId, true);
    },
    [loadOutputs],
  );

  const storage = jobs?.storage ?? data?.storage ?? null;
  const running = jobs?.jobs.find((j) => j.status === 'running');

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-paper">
      <AppTopBar
        accent="Studio"
        subtitle="Render queue: HyperFrames · Remotion · ffmpeg"
        center={
          <nav className="flex gap-1" aria-label="Studio tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={cn(
                  'h-8 rounded-full border px-4 text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors',
                  tab === t.id ? 'border-orange bg-orange/10 text-paper' : 'border-transparent text-secondary hover:border-subtle hover:text-paper',
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        }
        right={
          <>
            {running && (
              <span className="hud-label hidden !text-orange lg:inline">
                rendering{running.progress.pct !== null ? ` ${Math.round(running.progress.pct)}%` : ''}
              </span>
            )}
            {storage && (
              <span className={cn('hud-label hidden md:inline', !storage.ok && '!text-amber')} title={storage.reason ?? storage.root}>
                <HardDrive className="mr-1 inline h-3 w-3" />
                {storage.ok ? `Windsor ${fmtBytes(storage.freeBytes ?? 0)} free` : 'Windsor unavailable'}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                void loadProjects();
                void pollJobs();
                if (projectId) void loadOutputs(projectId, true);
              }}
              aria-label="Refresh"
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-subtle px-3 font-mono text-[10px] uppercase tracking-[0.06em] text-muted hover:text-paper"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </>
        }
      />

      {tab === 'flow' ? (
        <main className="hud-scroll min-h-0 flex-1 overflow-y-auto">
          <FlowPanel />
        </main>
      ) : (
        <div className="hud-scroll grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[250px_minmax(0,1fr)_400px] lg:overflow-hidden">
          <aside className="hud-scroll border-b border-subtle p-3 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <h2 className="hud-label mb-2 px-1">Projects</h2>
            {loadError && <p className="rounded-md border border-[#EF4444]/40 bg-[#EF4444]/5 px-3 py-2 font-mono text-[11px] text-[#EF4444]">{loadError}</p>}
            {!data && !loadError && <p className="px-1 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Loading...</p>}
            <ul className="space-y-1.5">
              {data?.projects.map((p) => {
                const n = jobs?.jobs.filter((j) => j.projectId === p.id && ACTIVE.has(j.status)).length ?? 0;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setProjectId(p.id)}
                      className={cn(
                        'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                        projectId === p.id ? 'border-orange/60 bg-orange/5' : 'border-subtle bg-panel hover:border-highlight',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-paper">{p.name}</span>
                        {n > 0 && <span className="rounded-full bg-orange px-1.5 font-mono text-[10px] font-bold text-black">{n}</span>}
                        {!p.exists && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber" aria-label="Folder missing" />}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={cn('rounded-full border px-1.5 font-mono text-[9px] uppercase tracking-[0.06em]', KIND_COLOR[p.kind])}>{p.kind}</span>
                        <span className="font-mono text-[10px] text-muted">
                          {p.presets.length ? `${p.presets.length} preset${p.presets.length === 1 ? '' : 's'}` : 'no presets'}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 px-1 text-[11px] leading-snug text-muted">
              Projects and presets live in <code className="font-mono">config/studio-projects.json</code>. Edit it and hit Refresh.
            </p>
          </aside>

          <main className="hud-scroll p-4 lg:overflow-y-auto">
            {project ? (
              <ProjectPanel
                project={project}
                configErrors={data?.configErrors ?? []}
                storage={storage}
                outputs={outputs[project.id] ?? null}
                outputsLoading={outputsLoading}
                onRefreshOutputs={() => void loadOutputs(project.id, true)}
                playingId={playingId}
                onPlay={setPlayingId}
                presetId={presetByProject[project.id] ?? null}
                onPreset={(id) => {
                  setPresetByProject((m) => ({ ...m, [project.id]: id }));
                  setPrefill(null);
                }}
                prefill={prefill}
                submitting={submitting}
                onSubmit={(pid, args) => void submit(pid, args)}
                onListCompositions={() => void listCompositions()}
                compositionsBusy={!!jobs?.jobs.some((j) => j.projectId === project.id && j.presetId === '__compositions' && ACTIVE.has(j.status))}
                onSend={sendToEditor}
                onCopy={(t, w) => void copy(t, w)}
                onQuickAction={quickAction}
                ffmpegReady={!!ffmpegProject?.presets.some((x) => x.ready)}
              />
            ) : (
              data && <p className="text-secondary">No projects configured. Add some to config/studio-projects.json.</p>
            )}
          </main>

          <aside className="flex h-[75vh] min-h-0 flex-col border-t border-subtle p-3 lg:h-auto lg:border-l lg:border-t-0">
            <QueuePanel data={jobs} selectedJobId={selectedJobId} onSelect={setSelectedJobId} onCancel={(id) => void cancel(id)} onPlay={playJob} onCopy={(t, w) => void copy(t, w)} />
          </aside>
        </div>
      )}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

export default StudioApp;
