'use client';
import { Copy, X, Zap } from 'lucide-react';

/** The consolidated agent prompt for the cart, shown after "Execute" (which only builds and copies it). */
export function PromptModal({ prompt, copied, onCopy, onClose }: { prompt: string; copied: boolean; onCopy: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div onClick={onClose} className="recos-fade absolute inset-0 bg-black/70 backdrop-blur-[3px]" />
      <div role="dialog" aria-modal="true" aria-label="Agent prompt" className="recos-pop relative flex max-h-[84vh] w-full max-w-[760px] flex-col overflow-hidden rounded-xl border border-highlight bg-panel shadow-[0_30px_80px_-20px_rgba(0,0,0,0.95)]">
        <div className="h-1 w-full bg-gradient-to-r from-[#22C55E] via-[#F5A623] to-[#FF5500]" />
        <header className="flex items-start gap-3 border-b border-subtle px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-orange/40 bg-orange/10">
            <Zap size={18} className="text-orange" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-paper">{copied ? 'Agent prompt copied' : 'Agent prompt ready'}</h2>
            <p className="mt-0.5 font-mono text-[11px] text-secondary">Paste it into Claude Code. VOLTA changes nothing itself.</p>
          </div>
          <button type="button" onClick={onCopy} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-orange bg-orange px-3 text-[12px] font-semibold text-obsidian hover:brightness-110">
            <Copy size={13} /> {copied ? 'Copy again' : 'Copy'}
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-md text-secondary transition-colors hover:bg-panel-hover hover:text-paper">
            <X size={16} />
          </button>
        </header>
        <pre className="hud-scroll selectable min-h-0 flex-1 overflow-auto whitespace-pre-wrap bg-obsidian p-5 font-mono text-[11.5px] leading-relaxed text-secondary">{prompt}</pre>
      </div>
    </div>
  );
}
