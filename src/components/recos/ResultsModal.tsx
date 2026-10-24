'use client';
import Link from 'next/link';
import { CircleCheck, FileText, X } from 'lucide-react';
import type { RecommendationCardExt } from '@/types/os';
import { BucketIcon } from './BucketIcon';

export interface ApplyResultItem {
  id: string;
  files: string[];
  summary: string;
}

export interface ResultsModalProps {
  results: ApplyResultItem[];
  recos: RecommendationCardExt[];
  onClose: () => void;
}

export function ResultsModal({ results, recos, onClose }: ResultsModalProps) {
  const allFiles = new Set(results.flatMap((r) => r.files));
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div onClick={onClose} className="recos-fade absolute inset-0 bg-black/70 backdrop-blur-[3px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upgrades applied"
        className="recos-pop relative flex max-h-[82vh] w-full max-w-[620px] flex-col overflow-hidden rounded-xl border border-highlight bg-panel shadow-[0_30px_80px_-20px_rgba(0,0,0,0.95)]"
      >
        <div className="h-1 w-full bg-gradient-to-r from-[#22C55E] via-[#F5A623] to-[#FF5500]" />
        <header className="flex items-start gap-3 border-b border-subtle px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-green/40 bg-green/10">
            <CircleCheck size={20} className="text-green" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-paper">
              {results.length} upgrade{results.length === 1 ? '' : 's'} applied
            </h2>
            <p className="mt-0.5 font-mono text-[11px] text-secondary">
              {allFiles.size} workspace file{allFiles.size === 1 ? '' : 's'} updated · logged under ## Applied Recos
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-secondary transition-colors hover:bg-panel-hover hover:text-paper"
          >
            <X size={16} />
          </button>
        </header>

        <ul className="hud-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 py-4">
          {results.map((res) => {
            const reco = recos.find((r) => r.id === res.id);
            return (
              <li key={res.id} className="rounded-lg border border-subtle bg-panel-elevated p-3">
                <div className="flex items-center gap-2">
                  {reco && <BucketIcon bucket={reco.bucket} size={16} />}
                  <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-paper">{reco?.title ?? res.id}</p>
                  <span className="font-mono text-[10px] text-muted">{res.id}</span>
                </div>
                <p className="mt-1 text-[12px] text-secondary">{res.summary}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {res.files.map((f) => (
                    <code
                      key={f}
                      className="inline-flex items-center gap-1 rounded border border-subtle bg-panel px-1.5 py-0.5 font-mono text-[10px] text-secondary"
                    >
                      <FileText size={10} className="text-green" /> {f}
                    </code>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>

        <footer className="flex items-center justify-end gap-2 border-t border-subtle px-5 py-3">
          <Link
            href="/second-brain"
            className="inline-flex h-9 items-center rounded-md border border-subtle px-3 text-[12.5px] font-medium text-secondary transition-colors hover:border-highlight hover:text-paper"
          >
            Inspect in Second Brain →
          </Link>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="inline-flex h-9 items-center rounded-md bg-orange px-4 text-[12.5px] font-semibold text-obsidian transition-all hover:brightness-110"
          >
            Nice — close
          </button>
        </footer>
      </div>
    </div>
  );
}
