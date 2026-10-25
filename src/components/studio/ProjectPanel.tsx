'use client';
// Centre column: the selected project's presets, compositions and recent outputs with an inline player.
import { useEffect, useMemo } from 'react';
import { AlertTriangle, Cloud, Copy, Film, Layers, Loader2, Music, Play, RefreshCw, Scissors, Send, Smartphone } from 'lucide-react';
import type { StudioOutput, StudioProject, StudioStorage } from '@/types/studio';
import { cn } from '@/lib/cn';
import { PresetForm } from './PresetForm';
import { KIND_COLOR, ago, fileUrl, fmtBytes, fmtDur } from './studio-client';

export interface Prefill {
  presetId: string;
  args: Record<string, unknown>;
}

interface Props {
  project: StudioProject;
  configErrors: string[];
  storage: StudioStorage | null;
  outputs: { items: StudioOutput[]; total: number } | null;
  outputsLoading: boolean;
  onRefreshOutputs: () => void;
  playingId: string | null;
  onPlay: (id: string | null) => void;
  presetId: string | null;
  onPreset: (id: string) => void;
  prefill: Prefill | null;
  submitting: boolean;
  onSubmit: (presetId: string, args: Record<string, unknown>) => void;
  onListCompositions: () => void;
  compositionsBusy: boolean;
  onSend: (o: StudioOutput) => void;
  onCopy: (text: string, what: string) => void;
  onQuickAction: (o: StudioOutput, preset: 'trim' | 'vertical-9x16' | 'mux-audio') => void;
  ffmpegReady: boolean;
}

const btn = 'inline-flex h-7 items-center gap-1 rounded-full border border-subtle px-2.5 font-mono text-[10px] uppercase tracking-[0.05em] text-secondary transition-colors hover:border-highlight hover:text-paper disabled:cursor-not-allowed disabled:opacity-40';

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="hud-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="hud-label">{title}</h2>
        <span className="ml-auto flex items-center gap-2">{right}</span>
      </div>
      {children}
    </section>
  );
}

function Player({ o, onClose }: { o: StudioOutput; onClose: () => void }) {
  return (
    <div className="overflow-hidden rounded-lg border border-subtle bg-black">
      {o.media === 'video' ? (
        // key: remount when the source changes so the element reloads
        <video key={o.id} src={fileUrl(o.id)} controls autoPlay preload="metadata" className="mx-auto block max-h-[46vh] w-full bg-black" />
      ) : (
        <div className="flex items-center gap-3 p-4">
          <Music className="h-5 w-5 shrink-0 text-orange" />
          <audio key={o.id} src={fileUrl(o.id)} controls autoPlay className="w-full" />
        </div>
      )}
      <div className="flex items-center gap-2 border-t border-subtle bg-panel px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-secondary" title={o.path}>
          {o.name}
        </span>
        <button type="button" onClick={onClose} className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted hover:text-paper">
          Close
        </button>
      </div>
    </div>
  );
}

export function ProjectPanel(p: Props) {
  const { project } = p;
  const preset = project.presets.find((x) => x.id === p.presetId) ?? project.presets[0] ?? null;
  const playing = useMemo(() => p.outputs?.items.find((o) => o.id === p.playingId) ?? null, [p.outputs, p.playingId]);
  const prefillValues = p.prefill && preset && p.prefill.presetId === preset.id ? p.prefill.args : undefined;

  // Pressing Escape closes the player (unless typing).
  const { playingId, onPlay } = p;
  useEffect(() => {
    if (!playingId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onPlay(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playingId, onPlay]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[20px] font-bold leading-none tracking-tight text-paper">{project.name}</h1>
            <span className={cn('rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]', KIND_COLOR[project.kind])}>{project.kind}</span>
          </div>
          <button
            type="button"
            onClick={() => p.onCopy(project.path, 'Project path')}
            className="mt-1.5 inline-flex max-w-full items-center gap-1.5 truncate font-mono text-[10.5px] text-muted hover:text-paper"
            title="Copy path"
          >
            <Copy className="h-3 w-3 shrink-0" />
            <span className="truncate">{project.path}</span>
          </button>
        </div>
      </header>
      {project.notes && <p className="text-[12.5px] leading-snug text-secondary">{project.notes}</p>}
      {!project.exists && (
        <p className="flex items-start gap-2 rounded-md border border-amber/40 bg-amber/5 px-3 py-2 text-[12.5px] text-paper">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" /> This folder does not exist (is the drive mounted?). Fix the path in config/studio-projects.json.
        </p>
      )}
      {p.configErrors.length > 0 && (
        <p className="rounded-md border border-[#EF4444]/40 bg-[#EF4444]/5 px-3 py-2 font-mono text-[11px] text-[#EF4444]">Config: {p.configErrors.join(' · ')}</p>
      )}

      {/* Presets */}
      <Section title="Presets">
        {project.presets.length === 0 ? (
          <p className="text-[12.5px] text-secondary">
            No render presets for this project. Add argv presets under this project in <code className="font-mono text-[11px]">config/studio-projects.json</code>.
            {project.docs.length > 0 && ' Reference files are listed below.'}
          </p>
        ) : (
          <>
            <nav className="mb-3 flex flex-wrap gap-1" aria-label="Presets">
              {project.presets.map((pr) => (
                <button
                  key={pr.id}
                  type="button"
                  onClick={() => p.onPreset(pr.id)}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors',
                    preset?.id === pr.id ? 'border-orange bg-orange/10 text-paper' : 'border-transparent text-secondary hover:border-subtle hover:text-paper',
                    !pr.ready && 'opacity-60',
                  )}
                >
                  {!pr.ready && <AlertTriangle className="h-3 w-3 text-amber" />}
                  {pr.label}
                </button>
              ))}
            </nav>
            {preset && (
              <PresetForm
                key={`${project.id}:${preset.id}`}
                project={project}
                preset={preset}
                prefill={prefillValues}
                storage={p.storage}
                busy={p.submitting}
                onSubmit={(args) => p.onSubmit(preset.id, args)}
              />
            )}
          </>
        )}
        {project.docs.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-subtle pt-3">
            <span className="hud-label !text-muted">Files</span>
            {project.docs.map((d) => (
              <button key={d.path} type="button" onClick={() => p.onCopy(d.path, d.name)} className={btn} title={`Copy ${d.path}`}>
                <Copy className="h-3 w-3" /> {d.name}
              </button>
            ))}
          </div>
        )}
      </Section>

      {/* Compositions */}
      {(project.kind === 'remotion' || project.kind === 'hyperframes') && (
        <Section
          title={`Compositions · ${project.compositions.length}`}
          right={
            project.canListCompositions && (
              <button type="button" onClick={p.onListCompositions} disabled={p.compositionsBusy} className={btn} title="Runs remotion compositions (bundles the project; slow). Queued like a render, result cached.">
                {p.compositionsBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Layers className="h-3 w-3" />} List with CLI
              </button>
            )
          }
        >
          {project.compositions.length === 0 ? (
            <p className="text-[12.5px] text-secondary">None found in the root file. {project.canListCompositions && 'Use List with CLI to ask Remotion (slow, cached).'}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {project.compositions.map((c) => (
                <li key={c.id} className="rounded-md border border-subtle bg-obsidian px-2.5 py-1.5" title={c.source === 'cli' ? 'From remotion compositions' : 'Read from the root file'}>
                  <span className="text-[12.5px] font-medium text-paper">{c.id}</span>
                  <span className="ml-2 font-mono text-[10px] text-muted">
                    {[c.width && c.height ? `${c.width}x${c.height}` : '', c.fps ? `${c.fps}fps` : '', c.durationSec ? fmtDur(c.durationSec) : ''].filter(Boolean).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.05em] text-muted">
            {project.compositionsCliAt ? `CLI listing cached ${ago(project.compositionsCliAt)}` : 'From source; CLI listing only runs when you ask'}
          </p>
        </Section>
      )}

      {/* Outputs */}
      <Section
        title={`Recent outputs${p.outputs ? ` · ${p.outputs.items.length}${p.outputs.total > p.outputs.items.length ? ` of ${p.outputs.total}` : ''}` : ''}`}
        right={
          <button type="button" onClick={p.onRefreshOutputs} className={btn} aria-label="Rescan outputs">
            <RefreshCw className={cn('h-3 w-3', p.outputsLoading && 'animate-spin')} /> Rescan
          </button>
        }
      >
        {playing && (
          <div className="mb-3">
            <Player o={playing} onClose={() => p.onPlay(null)} />
          </div>
        )}
        {!p.outputs ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">Scanning outputs...</p>
        ) : p.outputs.items.length === 0 ? (
          <p className="text-[12.5px] text-secondary">No mp4, mov, webm, wav or mp3 files in this project&apos;s output folders yet.</p>
        ) : (
          <ul className="divide-y divide-subtle">
            {p.outputs.items.map((o) => (
              <li key={o.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2', p.playingId === o.id && 'bg-orange/5')}>
                <button
                  type="button"
                  onClick={() => !o.offline && p.onPlay(p.playingId === o.id ? null : o.id)}
                  disabled={o.offline}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-subtle bg-obsidian text-orange hover:border-orange disabled:cursor-not-allowed disabled:text-muted"
                  aria-label={`Play ${o.name}`}
                  title={o.offline ? 'iCloud placeholder: not downloaded to this Mac' : 'Play'}
                >
                  {o.offline ? <Cloud className="h-4 w-4" /> : o.media === 'video' ? <Play className="h-4 w-4" /> : <Music className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-[12.5px] text-paper" title={o.path}>
                    {o.name}
                  </p>
                  <p className="truncate font-mono text-[10px] text-muted" title={o.path}>
                    {[o.rel !== o.name ? o.rel.replace(/\/[^/]*$/, '') : '', o.durationSec ? fmtDur(o.durationSec) : '', o.width ? `${o.width}x${o.height}` : '', fmtBytes(o.size), ago(o.mtime), o.offline ? 'iCloud, not downloaded' : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {o.media === 'video' && (
                    <button type="button" className={cn(btn, 'border-orange/40 text-orange hover:border-orange')} disabled={o.offline} onClick={() => p.onSend(o)} title="Add to the VOLTA Editor inbox">
                      <Send className="h-3 w-3" /> Editor
                    </button>
                  )}
                  <button type="button" className={btn} onClick={() => p.onCopy(o.path, 'Path')} title={o.path}>
                    <Copy className="h-3 w-3" /> Path
                  </button>
                  {p.ffmpegReady && !o.offline && o.media === 'video' && (
                    <>
                      <button type="button" className={btn} onClick={() => p.onQuickAction(o, 'trim')} title="Open Trim with this file">
                        <Scissors className="h-3 w-3" /> Trim
                      </button>
                      <button type="button" className={btn} onClick={() => p.onQuickAction(o, 'vertical-9x16')} title="Open Make vertical 9:16 with this file">
                        <Smartphone className="h-3 w-3" /> 9:16
                      </button>
                    </>
                  )}
                  {p.ffmpegReady && !o.offline && o.media === 'audio' && (
                    <button type="button" className={btn} onClick={() => p.onQuickAction(o, 'mux-audio')} title="Open Mux audio with this file">
                      <Film className="h-3 w-3" /> Mux
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
