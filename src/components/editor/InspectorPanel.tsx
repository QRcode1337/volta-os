'use client';

import { MessageSquare, X } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/cn';
import { CommentCard } from './CommentCard';
import { ScriptCuesTab } from './ScriptCuesTab';
import type { EditorClip, EditorPin, GroupMode, InspectorTab } from './types';

export interface InspectorPanelProps {
  tab: InspectorTab;
  group: GroupMode;
  clips: EditorClip[];
  pins: EditorPin[];
  focusClipId: string | null;
  pulse: { id: string; nonce: number } | null;
  editingPinId: string | null;
  activeLineKey: string | null;
  onTab: (t: InspectorTab) => void;
  onGroup: (g: GroupMode) => void;
  onClearFocus: () => void;
  onSeekPin: (id: string) => void;
  onSeek: (t: number) => void;
  onUpdatePin: (id: string, patch: Partial<Pick<EditorPin, 'commentText' | 'skill' | 'resolved'>>) => void;
  onDeletePin: (id: string) => void;
  onCopyPin: (id: string) => void;
  onEditing: (id: string | null) => void;
  onAddCue: (clipId: string, atSec: number, line: string, kind: 'animate' | 'cut') => void;
}

export const InspectorPanel = memo(function InspectorPanel(p: InspectorPanelProps) {
  const byId = new Map(p.clips.map((c) => [c.id, c]));
  const focusClip = p.focusClipId ? byId.get(p.focusClipId) : undefined;
  const scoped = (focusClip ? p.pins.filter((x) => x.clipId === focusClip.id) : p.pins).slice().sort((a, b) => a.timestampSec - b.timestampSec || a.number - b.number);

  const card = (pin: EditorPin) => (
    <CommentCard
      key={pin.id}
      pin={pin}
      clip={byId.get(pin.clipId)}
      pulsing={p.pulse?.id === pin.id ? p.pulse.nonce : null}
      editing={p.editingPinId === pin.id}
      onSeek={p.onSeekPin}
      onUpdate={p.onUpdatePin}
      onDelete={p.onDeletePin}
      onCopy={p.onCopyPin}
      onEditing={p.onEditing}
    />
  );

  const groups = p.clips
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((c) => ({ clip: c, pins: scoped.filter((x) => x.clipId === c.id) }))
    .filter((g) => g.pins.length > 0);

  return (
    <section className="hud-card flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <header className="flex h-9 shrink-0 items-center gap-1 border-b border-subtle px-2">
        <MessageSquare size={14} className="ml-1 mr-1 shrink-0 text-orange" />
        {(
          [
            ['comments', `COMMENTS (${p.pins.length})`],
            ['script', 'SCRIPT & CUES'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => p.onTab(k)}
            className={cn('h-6 rounded px-2 font-mono text-[10px] font-semibold tracking-wide', p.tab === k ? 'bg-orange/15 text-orange' : 'text-secondary hover:text-paper')}
          >
            {label}
          </button>
        ))}
      </header>
      {focusClip && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-subtle bg-orange/5 px-3 py-1.5 font-mono text-[10px] text-secondary">
          Showing Clip {String(focusClip.number).padStart(2, '0')} · <span className="truncate text-paper">{focusClip.title}</span>
          <button type="button" onClick={p.onClearFocus} className="ml-auto flex shrink-0 items-center gap-0.5 rounded px-1 text-orange hover:bg-orange/10">
            <X size={11} /> Show all
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {p.tab === 'comments' ? (
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
              {(
                [
                  ['clip', 'By clip'],
                  ['chrono', 'Chronological'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => p.onGroup(k)}
                  className={cn('h-5 rounded border px-1.5 font-mono text-[9.5px]', p.group === k ? 'border-orange/50 text-orange' : 'border-subtle text-muted hover:text-paper')}
                >
                  {label}
                </button>
              ))}
              <span className="ml-auto font-mono text-[9.5px] text-muted">{scoped.filter((x) => !x.resolved).length} open</span>
            </div>
            <div className="hud-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
              {scoped.length === 0 && (
                <div className="rounded-md border border-dashed border-subtle px-3 py-8 text-center font-mono text-[11px] leading-relaxed text-muted">
                  No pins yet.
                  <br />
                  Click anywhere on the video frame to drop one.
                </div>
              )}
              {p.group === 'chrono'
                ? scoped.map(card)
                : groups.map((g) => (
                    <div key={g.clip.id} className="space-y-1.5">
                      <div className="flex items-center gap-1.5 px-0.5 pt-1">
                        <span className="font-doto text-[11px] font-bold text-orange">{String(g.clip.number).padStart(2, '0')}</span>
                        <span className="truncate text-[11px] font-semibold text-secondary">{g.clip.title}</span>
                        <span className="ml-auto font-mono text-[9.5px] text-muted">{g.pins.length}</span>
                      </div>
                      {g.pins.map(card)}
                    </div>
                  ))}
            </div>
          </div>
        ) : (
          <ScriptCuesTab clips={p.clips} pins={p.pins} activeLineKey={p.activeLineKey} focusClipId={p.focusClipId} onSeek={p.onSeek} onAddCue={p.onAddCue} />
        )}
      </div>
    </section>
  );
});
