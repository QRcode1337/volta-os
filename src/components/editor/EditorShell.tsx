'use client';

import { Film, Scissors } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { EditorApp } from './EditorApp';
import { NleWorkspace } from './nle/NleWorkspace';

export type EditorMode = 'review' | 'edit';
const MODE_KEY = 'volta:editor-mode';

/** Review (pins + agent prompts) and Edit (the non-linear editor) share one app; the choice is remembered per browser and can be forced with ?mode=edit. */
export function EditorShell() {
  const [mode, setMode] = useState<EditorMode | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('mode');
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(MODE_KEY);
    } catch {
      /* private mode */
    }
    setMode(q === 'edit' || q === 'review' ? q : saved === 'edit' ? 'edit' : 'review');
  }, []);
  const choose = (m: EditorMode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
    const url = new URL(window.location.href);
    url.searchParams.set('mode', m);
    window.history.replaceState(null, '', url);
  };
  if (!mode) return <div className="h-screen w-screen bg-obsidian" />;
  const sw = <ModeSwitch mode={mode} onChange={choose} />;
  return mode === 'edit' ? <NleWorkspace modeSwitch={sw} /> : <EditorApp modeSwitch={sw} />;
}

export function ModeSwitch({ mode, onChange }: { mode: EditorMode; onChange: (m: EditorMode) => void }) {
  const item = (m: EditorMode, label: string, Icon: typeof Film, tip: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      title={tip}
      onClick={() => onChange(m)}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 font-mono text-[10.5px] font-semibold transition-colors max-md:h-8',
        mode === m ? 'bg-orange text-obsidian' : 'text-secondary hover:text-paper',
      )}
    >
      <Icon size={12} /> {label}
    </button>
  );
  return (
    <div role="tablist" aria-label="Editor mode" className="flex shrink-0 items-center gap-0.5 rounded-md border border-subtle bg-obsidian p-0.5">
      {item('review', 'Review', Film, 'Review: pin notes on renders and hand them to agents')}
      {item('edit', 'Edit', Scissors, 'Edit: cut, arrange and export a video (timeline, transitions, text, audio)')}
    </div>
  );
}
