'use client';

import { Check, Copy, FileText, X } from 'lucide-react';
import { useEffect, useMemo, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { lineDiff, withContext } from './diff';

function ModalShell({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cn('hud-card flex max-h-[86vh] w-full flex-col overflow-hidden shadow-2xl shadow-black/60', wide ? 'max-w-5xl' : 'max-w-3xl')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-subtle px-4">
          <div className="hud-label flex min-w-0 items-center gap-2 truncate text-paper">{title}</div>
          <button type="button" onClick={onClose} className="ml-auto rounded-md p-1 text-secondary hover:bg-panel-hover hover:text-paper" aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="hud-scroll min-h-0 flex-1 overflow-auto">{children}</div>
        {footer && <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-subtle px-4 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function PromptPreviewModal({ prompt, count, onCopy, onClose }: { prompt: string; count: number; onCopy: () => void; onClose: () => void }) {
  return (
    <ModalShell
      title={
        <>
          <FileText size={14} className="text-orange" /> Compiled prompt preview · {count} unresolved pins · {prompt.length.toLocaleString('en-US')} chars
        </>
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="h-8 rounded-md border border-subtle px-3 font-mono text-[11px] text-secondary hover:text-paper">
            Close (Esc)
          </button>
          <button type="button" onClick={onCopy} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-orange px-3 font-mono text-[11px] font-semibold text-obsidian hover:brightness-110">
            <Copy size={13} /> Copy to clipboard
          </button>
        </>
      }
    >
      <pre className="selectable whitespace-pre-wrap break-words p-4 font-mono text-[12px] leading-relaxed text-paper">{prompt}</pre>
    </ModalShell>
  );
}

export interface AppliedFile {
  path: string;
  before: string;
  after: string;
}

function FileDiff({ file }: { file: AppliedFile }) {
  const rows = useMemo(() => withContext(lineDiff(file.before, file.after), 3), [file]);
  const added = rows.filter((r) => r.kind === 'add').length;
  const removed = rows.filter((r) => r.kind === 'del').length;
  return (
    <section className="border-b border-subtle last:border-b-0">
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-panel-elevated px-4 py-2 font-mono text-[11px]">
        <span className="text-paper">{file.path}</span>
        {!file.before && <span className="rounded bg-teal/20 px-1.5 text-teal">new file</span>}
        <span className="ml-auto text-green">+{added}</span>
        <span className="text-[#EF4444]">−{removed}</span>
      </div>
      <div className="selectable font-mono text-[11.5px] leading-[1.55]">
        {rows.map((r, i) =>
          r.kind === 'gap' ? (
            <div key={i} className="bg-panel-hover/40 px-4 py-0.5 text-muted">
              ⋯ {r.count} unchanged line{r.count === 1 ? '' : 's'}
            </div>
          ) : (
            <div
              key={i}
              className={cn(
                'grid grid-cols-[3rem_3rem_1.2rem_1fr] px-2',
                r.kind === 'add' && 'bg-green/12 text-[#86EFAC]',
                r.kind === 'del' && 'bg-[#EF4444]/12 text-[#FCA5A5]',
                r.kind === 'same' && 'text-secondary',
              )}
            >
              <span className="select-none pr-2 text-right text-muted">{r.a ?? ''}</span>
              <span className="select-none pr-2 text-right text-muted">{r.b ?? ''}</span>
              <span className="select-none">{r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ' '}</span>
              <span className="whitespace-pre-wrap break-words">{r.text || ' '}</span>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

export function DiffModal({ files, onClose }: { files: AppliedFile[]; onClose: () => void }) {
  return (
    <ModalShell
      wide
      title={
        <>
          <Check size={14} className="text-green" /> Applied &amp; taught locally · {files.length} skill file{files.length === 1 ? '' : 's'} updated
        </>
      }
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose} className="h-8 rounded-md bg-orange px-3 font-mono text-[11px] font-semibold text-obsidian hover:brightness-110">
          Done
        </button>
      }
    >
      {files.map((f) => (
        <FileDiff key={f.path} file={f} />
      ))}
    </ModalShell>
  );
}

export interface ToastState {
  id: number;
  text: string;
  tone: 'ok' | 'error' | 'info';
}

export function EditorToast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2">
      <div
        key={toast.id}
        role="status"
        className={cn(
          'flex max-w-[640px] items-center gap-2 rounded-lg border px-4 py-2.5 text-[13px] font-medium shadow-xl shadow-black/50',
          toast.tone === 'ok' && 'border-green/50 bg-[#0F1A12] text-paper',
          toast.tone === 'error' && 'border-[#EF4444]/60 bg-[#1F0F0F] text-paper',
          toast.tone === 'info' && 'border-orange/50 bg-panel-elevated text-paper',
        )}
        style={{ animation: 'rubric-toast-in 220ms cubic-bezier(0.16,1,0.3,1)' }}
      >
        <span className={cn('h-2 w-2 shrink-0 rounded-full', toast.tone === 'ok' ? 'bg-green' : toast.tone === 'error' ? 'bg-[#EF4444]' : 'bg-orange')} />
        {toast.text}
      </div>
    </div>
  );
}
