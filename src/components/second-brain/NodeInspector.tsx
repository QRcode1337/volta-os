'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { CloudOff, Copy, ExternalLink, FileQuestion, FileText, Link2, RotateCw, TriangleAlert, X } from 'lucide-react';
import { ApiError, getJson } from '@/components/ltm/ltm-client';
import { formatInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { MarkdownView, type LinkKind } from './MarkdownView';
import { relTime, type GraphModel, type GraphNode } from './graph-model';

export type ToastFn = (msg: string, kind?: 'ok' | 'error') => void;

interface InspectorProps {
  node: GraphNode;
  model: GraphModel | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  toast: ToastFn;
  /** Post-mount clock (null before mount) for relative "modified" times. */
  nowMs: number | null;
  /**
   * Resolve a link inside `vaultId` to a note id, or null: each exact vault path in `target` first (in order),
   * then Obsidian-style lookup by note name (basename of the first).
   */
  resolveLink: (vaultId: string, target: string | string[]) => string | null;
}

/**
 * Screen pixels each drawer covers, measured from the view's edges (left-4 + w-[300px]; right-4 + 560px).
 * The orb / map use these to keep their controls and the selected note in the visible gap.
 */
export const INSPECTOR_INSET = { left: 16 + 300, right: 16 + 560 } as const;

const folderName = (n: { folder: string; vault: string }) => (n.folder === '(root)' ? `${n.vault} root` : n.folder);

/** Vault-relative path of a markdown-link href written inside `fromRelPath` ("/x.md" = vault root). */
function joinVaultPath(fromRelPath: string, href: string): string | null {
  const parts = href.startsWith('/') ? [] : fromRelPath.split('/').slice(0, -1);
  for (const seg of href.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.length ? parts.join('/') : null;
}

// Memoised: typing in the search box re-renders the app on every keystroke; the inspector's props don't change.
export const NodeInspector = memo(function NodeInspector({ node, model, onSelect, onClose, toast, nowMs, resolveLink }: InspectorProps) {
  const linked = useMemo(() => {
    if (!model || node.index < 0) return [];
    return (model.adj[node.index] ?? []).map((i) => model.nodes[i]).sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label));
  }, [model, node.index]);

  return (
    <>
      <NodeSummaryCard node={node} model={model} linked={linked} onSelect={onSelect} onClose={onClose} toast={toast} nowMs={nowMs} />
      <MarkdownDrawer key={node.id} node={node} onClose={onClose} onSelect={onSelect} resolveLink={resolveLink} />
    </>
  );
});

function LinkedNotes({ items, onSelect, stub }: { items: GraphNode[]; onSelect: (id: string) => void; stub: boolean }) {
  const [all, setAll] = useState(false);
  const CAP = 40;
  const shown = all ? items : items.slice(0, CAP);
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Link2 size={12} className="text-muted" />
        <span className="hud-label !text-[10px]">LINKED NOTES</span>
        <span className="ml-auto font-doto text-[13px] text-paper">{stub ? '—' : items.length}</span>
      </div>
      {stub ? (
        <div className="rounded-md border border-dashed border-subtle px-2 py-1.5 font-mono text-[10px] leading-relaxed text-muted">
          Not part of the graph view (top notes by link count), so its links aren&apos;t loaded here. Links in the note body still open other notes.
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-subtle px-2 py-1.5 font-mono text-[10px] text-muted">no links to other notes in this view</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {shown.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onSelect(n.id)}
                title={`${n.vault} / ${n.relPath} · ${n.degree} links`}
                className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-subtle bg-panel-elevated px-2 py-0.5 font-mono text-[10px] text-secondary transition-colors hover:border-highlight hover:text-paper"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: n.color }} />
                <span className="truncate">{n.label}</span>
              </button>
            ))}
          </div>
          {items.length > CAP && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-1.5 font-mono text-[10px] text-orange hover:underline">
              {all ? 'show fewer' : `+${items.length - CAP} more`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function NodeSummaryCard({
  node,
  model,
  linked,
  onSelect,
  onClose,
  toast,
  nowMs,
}: {
  node: GraphNode;
  model: GraphModel | null;
  linked: GraphNode[];
  onSelect: (id: string) => void;
  onClose: () => void;
  toast: ToastFn;
  nowMs: number | null;
}) {
  const color = node.color;
  const stub = !!node.stub;
  const maxDeg = model?.maxDegree ?? 1;
  const top = model?.nodes.find((n) => n.rank === 0);
  const pct = stub ? 0 : Math.round((node.degree / maxDeg) * 100);
  const modified = node.mtime ? relTime(node.mtime, nowMs) : '—';
  const localDate = nowMs != null && node.mtime ? new Date(node.mtime).toLocaleDateString('en-CA') : node.mtime.slice(0, 10);

  const copyPath = () => {
    const text = `${node.vault}/${node.relPath}`;
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast(`Copied ${text}`, 'ok'))
      .catch(() => toast('Clipboard blocked by the browser', 'error'));
  };

  return (
    <aside className="sb-drawer-left hud-card pointer-events-auto absolute bottom-4 left-4 top-16 z-30 flex w-[300px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden shadow-2xl shadow-black/60">
      <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <header className="flex items-start gap-2 border-b border-subtle px-3 py-2.5">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        <div className="min-w-0 flex-1">
          <div className="hud-label truncate !text-[9px]" style={{ color }}>
            {node.vault} · {folderName(node)}
          </div>
          <div className="break-words text-[17px] font-semibold leading-snug text-paper">{node.label}</div>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-panel-hover hover:text-paper" aria-label="Close">
          <X size={14} />
        </button>
      </header>
      <div className="hud-scroll flex-1 space-y-4 overflow-y-auto px-3 py-3">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="LINKS" value={stub ? '—' : formatInt(node.degree)} sub={stub ? 'not in graph view' : 'wikilinks · vault-wide'} />
          <Stat label="MODIFIED" value={modified} sub={localDate || 'unknown'} />
          <Stat label="IN VIEW" value={stub ? '—' : formatInt(linked.length)} sub="linked notes shown" />
          <Stat label="RANK" value={stub ? '—' : `#${node.rank + 1}`} sub={stub ? 'outside top notes' : `of ${formatInt(model?.nodes.length ?? 0)} by links`} />
        </div>

        {!stub && (
          <div>
            <div className="mb-1 flex justify-between gap-2 font-mono text-[9px] uppercase tracking-widest text-muted">
              <span>Link weight</span>
              <span className="truncate">
                {pct}% of {top ? top.label : 'top note'}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-panel-hover">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
            </div>
          </div>
        )}

        <div>
          <div className="hud-label mb-1 !text-[10px]">PATH</div>
          <div className="selectable break-all rounded-md border border-subtle bg-obsidian px-2 py-1.5 font-mono text-[10.5px] text-amber">
            <span className="text-muted">{node.vault}/</span>
            {node.relPath}
          </div>
          <div className="mt-2 flex gap-1.5">
            <a
              href={node.obsidianUrl}
              className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full border border-orange bg-orange px-3 font-mono text-[10px] font-semibold text-obsidian transition hover:brightness-110"
            >
              <ExternalLink size={11} /> OPEN IN OBSIDIAN
            </a>
            <button
              type="button"
              onClick={copyPath}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-subtle bg-panel-elevated px-2.5 font-mono text-[10px] font-semibold text-secondary hover:border-highlight hover:text-paper"
              title="Copy vault path"
            >
              <Copy size={11} /> PATH
            </button>
          </div>
        </div>

        <LinkedNotes key={node.id} items={linked} onSelect={onSelect} stub={stub} />
      </div>
    </aside>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0 rounded-md border border-subtle bg-panel-elevated px-2 py-1.5">
      <div className="font-mono text-[8.5px] font-semibold tracking-widest text-muted">{label}</div>
      <div className="truncate font-doto text-[18px] font-bold leading-tight text-paper">{value}</div>
      <div className="truncate font-mono text-[9px] text-muted">{sub}</div>
    </div>
  );
}

type NoteState =
  | { status: 'loading' }
  | { status: 'ok'; content: string }
  | { status: 'icloud' }
  | { status: 'missing' }
  | { status: 'error'; message: string };

const ICLOUD_NOTICE = '> This note is stored in iCloud only';

function MarkdownDrawer({
  node,
  onClose,
  onSelect,
  resolveLink,
}: {
  node: GraphNode;
  onClose: () => void;
  onSelect: (id: string) => void;
  resolveLink: (vaultId: string, target: string | string[]) => string | null;
}) {
  const [state, setState] = useState<NoteState>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    getJson<{ id: string; content: string; exists: boolean }>(`/api/brain/note?id=${encodeURIComponent(node.id)}`, ctrl.signal)
      .then((r) => {
        if (!r.exists) setState({ status: 'missing' });
        else if (r.content.startsWith(ICLOUD_NOTICE)) setState({ status: 'icloud' });
        else setState({ status: 'ok', content: r.content });
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === 'AbortError') return;
        setState({ status: 'error', message: e instanceof ApiError || e instanceof Error ? e.message : 'request failed' });
      });
    return () => ctrl.abort();
  }, [node.id, nonce]);

  // [[wikilinks]] resolve like Obsidian (vault path, else note name); markdown links are relative to this
  // note's folder (then tried from the vault root, then by note name).
  const resolveNoteLink = useCallback(
    (target: string, kind: LinkKind) => {
      if (kind === 'wiki') return resolveLink(node.vaultId, target);
      const rel = joinVaultPath(node.relPath, target);
      const root = target.replace(/^\/+/, '');
      return resolveLink(node.vaultId, rel && rel !== root ? [rel, root] : [root]);
    },
    [resolveLink, node.vaultId, node.relPath],
  );

  const chip =
    state.status === 'loading'
      ? { text: 'LOADING…', cls: 'border-subtle text-muted' }
      : state.status === 'ok'
        ? { text: 'ON DISK · READ-ONLY', cls: 'border-green/40 text-green' }
        : state.status === 'icloud'
          ? { text: 'ICLOUD ONLY', cls: 'border-amber/40 text-amber' }
          : state.status === 'missing'
            ? { text: 'NOT FOUND', cls: 'border-red-500/40 text-red-400' }
            : { text: 'ERROR', cls: 'border-red-500/40 text-red-400' };

  const content = state.status === 'ok' ? state.content : '';
  const words = useMemo(() => (content ? content.split(/\s+/).filter(Boolean).length : 0), [content]);

  return (
    <aside className="sb-drawer-right hud-card pointer-events-auto absolute bottom-4 right-4 top-16 z-30 flex w-[min(560px,calc(100vw-2rem))] flex-col overflow-hidden shadow-2xl shadow-black/60">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-subtle px-3">
        <FileText size={14} className="shrink-0 text-orange" />
        <span className="selectable min-w-0 truncate font-mono text-[11.5px] text-paper" title={`${node.vault}/${node.relPath}`}>
          <span className="text-muted">{node.vault}/</span>
          {node.relPath}
        </span>
        <span className={cn('ml-1 shrink-0 rounded-full border px-1.5 py-px font-mono text-[8.5px] tracking-widest', chip.cls)}>{chip.text}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <a
            href={node.obsidianUrl}
            className="inline-flex h-6 items-center gap-1 rounded-full border border-subtle bg-panel-elevated px-2.5 font-mono text-[10px] font-semibold text-secondary hover:border-highlight hover:text-paper"
            title="Open in Obsidian to edit"
          >
            <ExternalLink size={11} /> OBSIDIAN
          </a>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-panel-hover hover:text-paper" aria-label="Close drawer">
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {state.status === 'loading' && (
          <div className="space-y-3" aria-label="Loading note">
            {[72, 100, 94, 88, 60, 97, 81].map((w, i) => (
              <div key={i} className="robo-pulse h-3 rounded bg-panel-hover" style={{ width: `${w}%`, animationDelay: `${i * 90}ms` }} />
            ))}
          </div>
        )}
        {state.status === 'ok' &&
          (content.trim() ? (
            <MarkdownView source={content} resolveLink={resolveNoteLink} onOpenNote={onSelect} />
          ) : (
            <Notice icon={<FileText size={18} />} title="Empty note" body="This file exists but has no content yet." />
          ))}
        {state.status === 'icloud' && (
          <Notice
            icon={<CloudOff size={18} />}
            title="Stored in iCloud only"
            body="This note hasn't been downloaded to this Mac, so VOLTA won't force a download to read it. Open it in Obsidian to fetch it, then reopen it here."
            action={
              <a href={node.obsidianUrl} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-orange bg-orange px-3 font-mono text-[10px] font-semibold text-obsidian hover:brightness-110">
                <ExternalLink size={11} /> OPEN IN OBSIDIAN
              </a>
            }
          />
        )}
        {state.status === 'missing' && (
          <Notice
            icon={<FileQuestion size={18} />}
            title="Note not found on disk"
            body="It may have been moved, renamed or deleted since the vault index was built (the index is cached for up to 10 minutes)."
          />
        )}
        {state.status === 'error' && (
          <Notice
            icon={<TriangleAlert size={18} />}
            title="Couldn't load this note"
            body={state.message}
            action={
              <button
                type="button"
                onClick={() => setNonce((n) => n + 1)}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-subtle bg-panel-elevated px-3 font-mono text-[10px] font-semibold text-secondary hover:border-highlight hover:text-paper"
              >
                <RotateCw size={11} /> RETRY
              </button>
            }
          />
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-subtle px-3 py-1.5 font-mono text-[9.5px] text-muted">
        <span>READ-ONLY · edit in Obsidian</span>
        <span>{state.status === 'ok' ? `${formatInt(content.length)} chars · ${formatInt(words)} words` : ''}</span>
      </div>
    </aside>
  );
}

function Notice({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-subtle bg-panel-elevated text-secondary">{icon}</div>
      <div className="text-[14px] font-semibold text-paper">{title}</div>
      <p className="max-w-[360px] font-mono text-[11px] leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
