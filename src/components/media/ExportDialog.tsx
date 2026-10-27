'use client';
import { useEffect, useState } from 'react';
import { FolderOpen, FolderPlus } from 'lucide-react';
import type { GenItemRecord } from '@/types/media';
import { api, fmtBytes } from './gen-client';
import { Modal } from './ui';

interface ExportResult {
  dir: string;
  name: string;
  count: number;
  bytes: number;
  skipped: string[];
}

const defaultName = (filter: string) => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `volta-${filter === 'all' ? 'export' : filter}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

/** "Export all": name a new folder, copy every item in the current filter into it (+ index.csv), then open it. */
export function ExportDialog({
  open,
  filter,
  items,
  onClose,
  onError,
}: {
  open: boolean;
  filter: string;
  items: GenItemRecord[];
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  useEffect(() => {
    if (open) {
      setName(defaultName(filter));
      setResult(null);
    }
  }, [open, filter]);
  if (!open) return null;

  const bytes = items.reduce((a, it) => a + it.bytes, 0);
  const run = async () => {
    setBusy(true);
    try {
      setResult(await api<ExportResult>('/api/media/export', { filter, name }));
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const openFolder = async () => {
    if (!result) return;
    try {
      await api('/api/media/export', { open: result.name });
    } catch (err) {
      onError((err as Error).message);
    }
  };

  const btn = 'h-9 rounded-md border px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <Modal open onClose={busy ? () => {} : onClose} label="Export to a new folder" className="w-[min(480px,94vw)]">
      <div className="p-5">
        <p className="hud-label !text-orange">{result ? 'Exported' : 'Export to a new folder'}</p>
        {!result ? (
          <>
            <p className="mt-2 text-[12.5px] text-secondary">
              Copies {items.length} {filter === 'all' ? 'item' : filter}
              {items.length === 1 ? '' : 's'} ({fmtBytes(bytes)}) into a new folder with an <span className="font-mono">index.csv</span> of prompts, models and costs. The originals stay where they are.
            </p>
            <label className="mt-4 block">
              <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted">Folder name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy && items.length) void run();
                }}
                className="mt-1 h-9 w-full rounded-md border border-subtle bg-panel-elevated px-2.5 font-mono text-[12px] text-paper outline-none focus:border-orange"
              />
            </label>
            <p className="mt-1.5 break-all font-mono text-[10.5px] text-muted">/Volumes/Windsor/VOLTA/exports/{name.trim() || '…'}/</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={busy} className={`${btn} border-subtle text-secondary hover:border-highlight hover:text-paper`}>
                Cancel
              </button>
              <button type="button" onClick={() => void run()} disabled={busy || !items.length} className={`${btn} inline-flex items-center gap-1.5 border-orange bg-orange font-bold text-obsidian hover:brightness-110`}>
                <FolderPlus className="h-3.5 w-3.5" /> {busy ? 'Copying…' : `Export ${items.length}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-[12.5px] text-paper">
              {result.count} file{result.count === 1 ? '' : 's'} ({fmtBytes(result.bytes)}) copied.
            </p>
            <p className="mt-1.5 break-all rounded-md border border-subtle bg-obsidian p-2 font-mono text-[11px] text-secondary">{result.dir}/</p>
            {result.skipped.length > 0 && (
              <p className="mt-2 font-mono text-[10.5px] text-amber">
                Skipped {result.skipped.length}: {result.skipped.slice(0, 3).join('; ')}
                {result.skipped.length > 3 ? '…' : ''}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => void openFolder()} className={`${btn} inline-flex items-center gap-1.5 border-subtle text-paper hover:border-highlight`}>
                <FolderOpen className="h-3.5 w-3.5" /> Open in Finder
              </button>
              <button type="button" onClick={onClose} className={`${btn} border-orange bg-orange font-bold text-obsidian hover:brightness-110`}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
