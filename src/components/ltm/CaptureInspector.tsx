'use client';
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, ExternalLink, ImageOff, Maximize2, X } from 'lucide-react';
import type { LtmCapture, LtmSessionNote } from '@/types/ltm';
import { cn } from '@/lib/cn';
import { appColor, dayLabel, hhmmss } from './ltm-client';
import { Highlight } from './Highlight';

interface CaptureInspectorProps {
  capture: LtmCapture | null;
  loading: boolean;
  error: string | null;
  query: string;
  sessions: LtmSessionNote[];
  tab: 'capture' | 'sessions';
  onTab: (t: 'capture' | 'sessions') => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onCopy: (text: string, what: string) => void;
  onOpenSession: (s: LtmSessionNote) => void;
  lightbox: boolean;
  onLightbox: (open: boolean) => void;
}

export function CaptureInspector(props: CaptureInspectorProps) {
  const { capture, loading, error, query, sessions, tab, onTab } = props;
  const covering = capture
    ? sessions.find((s) => s.captureFrom != null && s.captureTo != null && capture.id >= s.captureFrom && capture.id <= s.captureTo)
    : undefined;

  return (
    <section className="flex min-h-0 w-[42%] min-w-[380px] shrink-0 flex-col border-l border-subtle bg-panel/40 max-md:min-h-[60dvh] max-md:w-full max-md:min-w-0 max-md:max-w-none max-md:shrink-0 max-md:border-l-0 max-md:border-t">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-subtle px-2">
        {(['capture', 'sessions'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTab(t)}
            className={cn(
              'rounded-md px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors',
              tab === t ? 'bg-panel-elevated text-paper ring-1 ring-highlight' : 'text-muted hover:text-paper',
            )}
          >
            {t === 'capture' ? 'Capture' : `Vault notes (${sessions.length})`}
          </button>
        ))}
        {tab === 'capture' && capture && (
          <div className="ml-auto flex items-center gap-1">
            <IconBtn label="Previous (k)" onClick={props.onPrev}>
              <ChevronUp className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn label="Next (j)" onClick={props.onNext}>
              <ChevronDown className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn label="Copy OCR text" onClick={() => props.onCopy(capture.content, 'OCR text')}>
              <Copy className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
        )}
      </div>

      {tab === 'sessions' ? (
        <SessionsPanel sessions={sessions} onOpen={props.onOpenSession} />
      ) : !capture ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center font-mono text-[11px] text-muted">
          {error ? <span className="text-[#EF4444]">{error}</span> : loading ? 'Loading capture…' : 'Select a capture to inspect it.'}
        </div>
      ) : (
        <div className="hud-scroll min-h-0 flex-1 overflow-y-auto">
          <Frame capture={capture} onOpen={() => props.onLightbox(true)} />
          <div className="border-b border-subtle px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: appColor(capture.app) }} />
              <span className="text-[13px] font-semibold text-paper">{capture.app}</span>
              <span className="font-mono text-[11px] text-orange">{hhmmss(capture.ts)}</span>
              <span className="font-mono text-[10px] uppercase text-muted">{dayLabel(capture.ts.slice(0, 10)).long}</span>
              <span className="ml-auto font-mono text-[10px] text-muted">#{capture.id}</span>
            </div>
            {capture.title && (
              <div className="mt-1 text-[12px] leading-snug text-secondary">
                <Highlight text={capture.title} query={query} />
              </div>
            )}
            {covering && (
              <button
                type="button"
                onClick={() => props.onOpenSession(covering)}
                className="mt-2 flex w-full items-start gap-2 rounded-md border border-purple/40 bg-purple/10 px-2.5 py-2 text-left transition-colors hover:bg-purple/20"
              >
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-purple" />
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold text-paper">{covering.title}</span>
                  {covering.tldr && <span className="line-clamp-2 text-[10.5px] leading-snug text-secondary">{covering.tldr}</span>}
                </span>
              </button>
            )}
          </div>
          <div className="px-4 py-3">
            <div className="hud-label mb-2">Screen text (OCR)</div>
            {capture.content ? (
              <pre className="selectable whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-secondary">
                <Highlight text={capture.content} query={query} />
              </pre>
            ) : (
              <div className="font-mono text-[11px] text-muted">No text captured.</div>
            )}
          </div>
        </div>
      )}

      {props.lightbox && capture && <Lightbox capture={capture} onClose={() => props.onLightbox(false)} />}
    </section>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: (() => void) | null; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={!onClick}
      onClick={onClick ?? undefined}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel-hover hover:text-paper disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Frame({ capture, onOpen }: { capture: LtmCapture; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [capture.id]);
  if (!capture.hasFrame || failed) {
    return (
      <div className="flex aspect-[16/10] items-center justify-center gap-2 border-b border-subtle bg-obsidian font-mono text-[11px] text-muted">
        <ImageOff className="h-4 w-4" /> Screenshot {capture.hasFrame ? 'pruned or unavailable' : 'not recorded'}
      </div>
    );
  }
  return (
    <button type="button" onClick={onOpen} className="group relative block w-full border-b border-subtle bg-obsidian">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={capture.id}
        src={`/api/ltm/frame/${capture.id}`}
        alt={`Screenshot of ${capture.app} at ${capture.ts}`}
        onError={() => setFailed(true)}
        className="block max-h-[46vh] w-full object-contain"
      />
      <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-obsidian/80 text-secondary opacity-0 transition-opacity group-hover:opacity-100">
        <Maximize2 className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

function Lightbox({ capture, onClose }: { capture: LtmCapture; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-6" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/ltm/frame/${capture.id}`} alt="" className="max-h-full max-w-full object-contain shadow-2xl" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-panel-elevated text-paper"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-panel-elevated px-3 py-1 font-mono text-[11px] text-secondary">
        {capture.app} · {capture.ts.slice(0, 10)} {hhmmss(capture.ts)} · Esc to close
      </div>
    </div>
  );
}

function SessionsPanel({ sessions, onOpen }: { sessions: LtmSessionNote[]; onOpen: (s: LtmSessionNote) => void }) {
  if (!sessions.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center font-mono text-[11px] leading-relaxed text-muted">
        No Pieces-Vault summaries for this day.
        <br />
        (Summaries come from ltm_ingest — check that its scheduler is running.)
      </div>
    );
  }
  return (
    <ul className="hud-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      {sessions.map((s) => (
        <li key={s.file} className="hud-card p-3">
          <div className="flex items-start gap-2">
            <button type="button" onClick={() => onOpen(s)} className="min-w-0 flex-1 text-left">
              <div className="text-[12.5px] font-semibold leading-snug text-paper hover:text-orange">{s.title}</div>
              {s.timeLabel && <div className="mt-0.5 font-mono text-[10px] text-muted">{s.timeLabel}</div>}
            </button>
            {s.obsidianUrl && (
              <a
                href={s.obsidianUrl}
                title="Open in Obsidian"
                className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-purple/40 px-2 font-mono text-[9px] uppercase text-purple hover:bg-purple/15"
              >
                Obsidian <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {s.tldr && <p className="mt-2 text-[11.5px] leading-relaxed text-secondary">{s.tldr}</p>}
          {s.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {s.tags.slice(0, 8).map((t) => (
                <span key={t} className="rounded-full border border-subtle px-1.5 py-px font-mono text-[9px] text-muted">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
