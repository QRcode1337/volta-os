'use client';
// VOLTA Editor — Edit mode export dialog: render the sequence to MP4 on the server (ffmpeg job, polled), or take it
// out as HyperFrames HTML / project JSON.

import { AlertTriangle, Check, ChevronRight, Clipboard, Code2, Download, ExternalLink, Film, Loader2, MonitorPlay, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { NleExportJob, NleExportRequest, NleSequence } from '@/types/nle';
import { fmtShort, fmtTC, sequenceDuration } from '@/lib/nle/model';

export interface NleExportDialogProps {
  open: boolean;
  onClose: () => void;
  seq: NleSequence;
  onOpenInReview?: (job: NleExportJob) => void;
}

type Res = 720 | 1080 | 2160 | 'source';
const RES_OPTIONS: { value: Res; label: string }[] = [
  { value: 720, label: '720p' },
  { value: 1080, label: '1080p' },
  { value: 2160, label: '4K' },
  { value: 'source', label: 'Source' },
];
const FPS_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Source' },
  { value: 24, label: '24' },
  { value: 30, label: '30' },
  { value: 60, label: '60' },
];
const QUALITY: { value: NleExportRequest['quality']; label: string; hint: string }[] = [
  { value: 'draft', label: 'Draft', hint: 'Fast, small file for checking the cut' },
  { value: 'standard', label: 'Standard', hint: 'Good for sharing and review' },
  { value: 'high', label: 'High', hint: 'Slow encode, best quality' },
];
const POLL_MS = 700;
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** "1080p" means the short side, so a 9:16 sequence at 1080p renders 1080×1920. Returns the output height. */
function outHeight(seq: NleSequence, res: Res): number | null {
  if (res === 'source') return null;
  return seq.height > seq.width ? even((res * seq.height) / seq.width) : res;
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled edit';

function downloadBlob(data: BlobPart, type: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function errorText(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { error?: string };
    if (j?.error) return j.error;
  } catch {
    /* not JSON */
  }
  return r.status === 404 ? 'Service not available (HTTP 404)' : `Server error (HTTP ${r.status})`;
}

const TERMINAL = new Set<NleExportJob['status']>(['done', 'error', 'cancelled']);

export function NleExportDialog({ open, onClose, seq, onOpenInReview }: NleExportDialogProps) {
  const [fileName, setFileName] = useState(seq.name);
  const [res, setRes] = useState<Res>(1080);
  const [fps, setFps] = useState<number | null>(null);
  const [quality, setQuality] = useState<NleExportRequest['quality']>('standard');
  const [job, setJob] = useState<NleExportJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [aside, setAside] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [busyAside, setBusyAside] = useState<'hf' | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const progressT0 = useRef<{ t: number; p: number } | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const running = starting || (!!job && !TERMINAL.has(job.status));
  const dur = sequenceDuration(seq);
  const h = outHeight(seq, res);
  const outH = h ?? seq.height;
  const outW = h == null ? seq.width : even((h * seq.width) / seq.height);

  // fresh form each time the dialog opens (unless a render is still going)
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current && !running) {
      setFileName(seq.name);
      setErr(null);
      setAside(null);
      if (job && TERMINAL.has(job.status) && job.status !== 'done') setJob(null);
    }
    wasOpen.current = open;
  }, [open, running, seq.name, job]);

  // polling
  const poll = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/editor/nle/export?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(await errorText(r));
      const j = (await r.json()) as { job: NleExportJob };
      setJob(j.job);
      const p = j.job.progress;
      if (p > 0.01 && p < 1) {
        if (!progressT0.current) progressT0.current = { t: Date.now(), p };
        else {
          const dt = (Date.now() - progressT0.current.t) / 1000;
          const dp = p - progressT0.current.p;
          if (dp > 0.005 && dt > 1) setEta((dt / dp) * (1 - p));
        }
      }
      if (!TERMINAL.has(j.job.status)) pollTimer.current = setTimeout(() => poll(id), POLL_MS);
    } catch (e) {
      setErr(`Lost track of the export: ${e instanceof Error ? e.message : String(e)}`);
      pollTimer.current = setTimeout(() => poll(id), POLL_MS * 3);
    }
  }, []);

  useEffect(
    () => () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    },
    [],
  );

  const start = async () => {
    if (running || dur <= 0) return;
    setErr(null);
    setStarting(true);
    setEta(null);
    progressT0.current = null;
    try {
      const body: NleExportRequest = { sequence: seq, height: h, fps, quality, fileName: safeName(fileName) };
      const r = await fetch('/api/editor/nle/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await errorText(r));
      const j = (await r.json()) as { job: NleExportJob };
      setJob(j.job);
      if (!TERMINAL.has(j.job.status)) pollTimer.current = setTimeout(() => poll(j.job.id), POLL_MS);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (!job) return;
    try {
      const r = await fetch(`/api/editor/nle/export?id=${encodeURIComponent(job.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
      if (!r.ok) throw new Error(await errorText(r));
      const j = (await r.json().catch(() => null)) as { job?: NleExportJob } | null;
      if (j?.job) setJob(j.job);
      else setJob({ ...job, status: 'cancelled' });
      if (pollTimer.current) clearTimeout(pollTimer.current);
      // one last poll so the final state (and partial log) comes from the server
      pollTimer.current = setTimeout(() => poll(job.id), POLL_MS);
    } catch (e) {
      setErr(`Cancel failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const copyPath = async () => {
    if (!job?.outputPath) return;
    try {
      await navigator.clipboard.writeText(job.outputPath);
      setAside({ text: 'Path copied', tone: 'ok' });
    } catch {
      setAside({ text: `Copy failed — path: ${job.outputPath}`, tone: 'error' });
    }
  };

  const exportHyperFrames = async () => {
    setBusyAside('hf');
    setAside(null);
    try {
      const r = await fetch('/api/editor/nle/hyperframes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sequence: seq }) });
      if (!r.ok) throw new Error(await errorText(r));
      const j = (await r.json()) as { html: string; fileName?: string };
      downloadBlob(j.html, 'text/html;charset=utf-8', j.fileName || `${safeName(fileName)}.html`);
      setAside({ text: 'HyperFrames HTML downloaded', tone: 'ok' });
    } catch (e) {
      setAside({ text: `HyperFrames export failed: ${e instanceof Error ? e.message : String(e)}`, tone: 'error' });
    } finally {
      setBusyAside(null);
    }
  };

  const downloadJson = () => {
    downloadBlob(JSON.stringify(seq, null, 2), 'application/json', `${safeName(fileName)}.volta-edit.json`);
    setAside({ text: 'Project JSON downloaded', tone: 'ok' });
  };

  // Escape closes when nothing is rendering
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (!running) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, running, onClose]);

  if (!open) return null;

  const status = job?.status;
  const pct = job ? Math.round(Math.max(0, Math.min(1, job.progress)) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" onMouseDown={() => !running && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Export" className="hud-card flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden shadow-2xl shadow-black/60" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-subtle px-4">
          <div className="hud-label flex min-w-0 items-center gap-2 truncate text-paper">
            <Film size={14} className="text-orange" /> Export
          </div>
          <button type="button" onClick={onClose} className="ml-auto rounded-md p-1 text-secondary hover:bg-panel-hover hover:text-paper" aria-label={running ? 'Hide (export keeps running)' : 'Close'} title={running ? 'Hide: the export keeps running' : 'Close (Esc)'}>
            <X size={16} />
          </button>
        </header>

        <div className="hud-scroll min-h-0 flex-1 space-y-4 overflow-auto p-4">
          {/* settings */}
          <fieldset disabled={running} className={cn('space-y-3', running && 'opacity-50')}>
            <label className="block">
              <span className="hud-label !text-[10px]">File name</span>
              <div className="mt-1 flex items-center rounded-md border border-subtle bg-obsidian focus-within:border-orange/60">
                <input
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') start();
                  }}
                  className="h-8 min-w-0 flex-1 bg-transparent px-2.5 text-[13px] text-paper outline-none"
                  spellCheck={false}
                  aria-label="File name"
                />
                <span className="pr-2.5 font-mono text-[11px] text-muted">.mp4</span>
              </div>
            </label>

            <Choice label="Resolution">
              {RES_OPTIONS.map((o) => (
                <Chip key={o.label} on={res === o.value} onClick={() => setRes(o.value)}>
                  {o.label}
                </Chip>
              ))}
            </Choice>
            <Choice label="Frame rate">
              {FPS_OPTIONS.map((o) => (
                <Chip key={o.label} on={fps === o.value} onClick={() => setFps(o.value)}>
                  {o.value == null ? `Source (${seq.fps})` : o.label}
                </Chip>
              ))}
            </Choice>
            <Choice label="Quality">
              {QUALITY.map((o) => (
                <Chip key={o.value} on={quality === o.value} onClick={() => setQuality(o.value)} title={o.hint}>
                  {o.label}
                </Chip>
              ))}
            </Choice>

            <div className="grid grid-cols-3 gap-2 rounded-md border border-subtle bg-obsidian/50 px-3 py-2 font-mono text-[10.5px]">
              <Stat label="Duration" value={dur > 0 ? fmtShort(dur) : '—'} sub={fmtTC(dur, seq.fps)} />
              <Stat label="Frame" value={`${outW}×${outH}`} sub={outH > seq.height ? 'upscaled' : outH === seq.height ? 'sequence size' : `from ${seq.width}×${seq.height}`} warn={outH > seq.height} />
              <Stat label="Clips" value={String(seq.clips.length)} sub={`${fps ?? seq.fps} fps · ${quality}`} />
            </div>
          </fieldset>

          {/* job */}
          {(starting || job) && (
            <div className="space-y-2 rounded-md border border-subtle bg-panel-elevated p-3">
              <div className="flex items-center gap-2 font-mono text-[11px]">
                {status === 'done' ? (
                  <Check size={13} className="text-green" />
                ) : status === 'error' ? (
                  <AlertTriangle size={13} className="text-[#EF4444]" />
                ) : status === 'cancelled' ? (
                  <X size={13} className="text-muted" />
                ) : (
                  <Loader2 size={13} className="animate-spin text-orange" />
                )}
                <span className="text-paper">
                  {starting && !job ? 'Starting…' : status === 'queued' ? 'Queued' : status === 'running' ? 'Rendering' : status === 'done' ? 'Export finished' : status === 'error' ? 'Export failed' : 'Cancelled'}
                </span>
                {running && job && (
                  <span className="ml-auto tabular-nums text-secondary">
                    {pct}%{eta != null && eta > 0.5 ? ` · ~${fmtEta(eta)} left` : ''}
                  </span>
                )}
              </div>
              {(running || status === 'done') && (
                <div className="h-1.5 overflow-hidden rounded-full bg-obsidian">
                  <div className={cn('h-full rounded-full transition-[width] duration-500', status === 'done' ? 'bg-green' : 'bg-orange')} style={{ width: `${status === 'done' ? 100 : Math.max(2, pct)}%` }} />
                </div>
              )}
              {status === 'done' && job && (
                <>
                  {job.outputPath && <code className="selectable block truncate rounded bg-obsidian px-2 py-1 font-mono text-[10px] text-secondary" title={job.outputPath}>{job.outputPath}</code>}
                  <div className="flex flex-wrap gap-1.5">
                    {job.url && (
                      <a href={job.url} target="_blank" rel="noreferrer noopener" className={BTN_PRIMARY}>
                        <ExternalLink size={12} /> Open file
                      </a>
                    )}
                    {job.outputPath && (
                      <button type="button" onClick={copyPath} className={BTN_SECONDARY}>
                        <Clipboard size={12} /> Copy path
                      </button>
                    )}
                    {onOpenInReview && (
                      <button type="button" onClick={() => onOpenInReview(job)} className={BTN_SECONDARY}>
                        <MonitorPlay size={12} /> Open in Review
                      </button>
                    )}
                  </div>
                </>
              )}
              {status === 'error' && job && (
                <>
                  <p className="selectable break-words font-mono text-[11px] text-[#FCA5A5]">{job.error || 'Unknown error'}</p>
                  {job.log && <LogBlock log={job.log} />}
                </>
              )}
              {status === 'cancelled' && job?.log && <LogBlock log={job.log} />}
            </div>
          )}
          {err && (
            <p className="flex items-start gap-1.5 rounded-md border border-[#EF4444]/40 bg-[#EF4444]/5 px-3 py-2 font-mono text-[11px] text-[#FCA5A5]">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> <span className="selectable break-words">{err}</span>
            </p>
          )}

          {/* other formats */}
          <div className="border-t border-subtle pt-3">
            <div className="hud-label mb-1.5 !text-[10px]">Other formats</div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={exportHyperFrames} disabled={busyAside === 'hf' || !seq.clips.length} className={BTN_SECONDARY} title="A self-contained HyperFrames HTML composition of this edit">
                {busyAside === 'hf' ? <Loader2 size={12} className="animate-spin" /> : <Code2 size={12} />} Export HyperFrames HTML
              </button>
              <button type="button" onClick={downloadJson} className={BTN_SECONDARY} title="The raw sequence (re-importable)">
                <Download size={12} /> Download project JSON
              </button>
            </div>
            {aside && <p className={cn('mt-1.5 break-words font-mono text-[10.5px]', aside.tone === 'ok' ? 'text-green' : 'text-[#FCA5A5]')}>{aside.text}</p>}
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-subtle px-4 py-3">
          {dur <= 0 && <span className="mr-auto font-mono text-[10.5px] text-amber">The timeline is empty.</span>}
          {running ? (
            <>
              <span className="mr-auto font-mono text-[10px] text-muted">You can hide this dialog; the render continues.</span>
              <button type="button" onClick={cancel} disabled={!job} className="h-8 rounded-md border border-[#EF4444]/50 px-3 font-mono text-[11px] text-[#FCA5A5] hover:bg-[#EF4444]/10 disabled:opacity-40">
                Cancel export
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} className="h-8 rounded-md border border-subtle px-3 font-mono text-[11px] text-secondary hover:text-paper">
                Close
              </button>
              <button type="button" onClick={start} disabled={dur <= 0} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-orange px-3 font-mono text-[11px] font-semibold text-obsidian hover:brightness-110 disabled:opacity-40">
                <Film size={13} /> {status === 'done' || status === 'error' || status === 'cancelled' ? 'Export again' : 'Export'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

const BTN_PRIMARY = 'inline-flex h-7 items-center gap-1.5 rounded-md bg-orange px-2.5 font-mono text-[10.5px] font-semibold text-obsidian hover:brightness-110';
const BTN_SECONDARY =
  'inline-flex h-7 items-center gap-1.5 rounded-md border border-subtle px-2.5 font-mono text-[10.5px] text-secondary hover:border-highlight hover:text-paper disabled:pointer-events-none disabled:opacity-40';

function fmtEta(s: number): string {
  if (s < 60) return `${Math.ceil(s)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

function Choice({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="hud-label mb-1 !text-[10px]">{label}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={cn('h-7 rounded-md border px-3 font-mono text-[11px]', on ? 'border-orange/70 bg-orange/15 font-semibold text-orange' : 'border-subtle text-secondary hover:border-highlight hover:text-paper')}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wide text-muted">{label}</div>
      <div className="truncate text-paper">{value}</div>
      {sub && <div className={cn('truncate text-[9px]', warn ? 'text-amber' : 'text-muted')}>{sub}</div>}
    </div>
  );
}

function LogBlock({ log }: { log: string }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1 font-mono text-[10px] text-secondary hover:text-paper">
        <ChevronRight size={11} className="transition-transform group-open:rotate-90" /> ffmpeg log
      </summary>
      <pre className="selectable hud-scroll mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-obsidian p-2 font-mono text-[10px] leading-relaxed text-muted">{log}</pre>
    </details>
  );
}
