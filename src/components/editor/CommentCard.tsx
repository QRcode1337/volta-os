'use client';

import { Copy, FileText, Trash2 } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { coordsLabel, regionDescriptor } from './spatial';
import { SKILL_COLORS, SKILL_OPTIONS, type EditorClip, type EditorPin, type SkillTag } from './types';

export interface CommentCardProps {
  pin: EditorPin;
  clip: EditorClip | undefined;
  pulsing: number | null;
  editing: boolean;
  onSeek: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Pick<EditorPin, 'commentText' | 'skill' | 'resolved'>>) => void;
  onDelete: (id: string) => void;
  onCopy: (id: string) => void;
  onEditing: (id: string | null) => void;
}

export const CommentCard = memo(function CommentCard({ pin, clip, pulsing, editing, onSeek, onUpdate, onDelete, onCopy, onEditing }: CommentCardProps) {
  const [draft, setDraft] = useState(pin.commentText);
  const ref = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (pulsing !== null) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [pulsing]);
  useEffect(() => {
    if (editing) {
      setDraft(pin.commentText);
      requestAnimationFrame(() => {
        taRef.current?.focus();
        taRef.current?.select();
      });
    }
  }, [editing, pin.commentText]);

  const commit = () => {
    const v = draft.trim();
    if (v && v !== pin.commentText) onUpdate(pin.id, { commentText: v });
    onEditing(null);
  };

  return (
    <div
      ref={ref}
      className={cn(
        'rounded-md border bg-obsidian/50 p-2.5 transition-colors',
        pin.resolved ? 'border-subtle opacity-60' : 'border-subtle hover:border-highlight',
        pulsing !== null && 'editor-card-flash border-orange',
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn('flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[10px] font-bold text-obsidian', pin.resolved ? 'bg-green' : 'bg-orange')}>#{pin.number}</span>
        <button
          type="button"
          onClick={() => onSeek(pin.id)}
          title="Seek to this pin and highlight it on the canvas"
          className="rounded border border-orange/40 bg-orange/10 px-1.5 py-px font-doto text-[11px] font-bold text-orange hover:bg-orange/20"
        >
          {pin.formattedTime}
        </button>
        <span className="rounded bg-panel-hover px-1.5 py-px font-mono text-[9.5px] text-secondary" title={regionDescriptor(pin.xPercent, pin.yPercent)}>
          {pin.region ? '⬜ ' : ''}
          {coordsLabel(pin)}
        </span>
        <select
          value={pin.skill}
          onChange={(e) => onUpdate(pin.id, { skill: e.target.value as SkillTag })}
          className="rounded border-0 px-1 py-px font-mono text-[9.5px] font-bold text-obsidian outline-none"
          style={{ background: SKILL_COLORS[pin.skill] }}
          aria-label="Target skill"
        >
          {SKILL_OPTIONS.map((o) => (
            <option key={o.tag} value={o.tag} className="bg-panel text-paper">
              {o.short}
            </option>
          ))}
        </select>
      </div>
      {clip && (
        <div className="mt-1 truncate font-mono text-[9.5px] text-muted">
          File {String(clip.number).padStart(2, '0')} · {clip.name}
        </div>
      )}
      {pin.scriptLine && (
        <div className="mt-1 flex items-start gap-1 rounded bg-panel-hover/60 px-1.5 py-1 font-serif text-[11.5px] italic leading-snug text-secondary">
          <FileText size={11} className="mt-0.5 shrink-0 text-teal" />“{pin.scriptLine}”
        </div>
      )}
      {editing ? (
        <textarea
          ref={taRef}
          value={draft}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setDraft(pin.commentText);
              onEditing(null);
            }
          }}
          className="mt-1.5 w-full resize-none rounded border border-orange/60 bg-obsidian px-2 py-1.5 text-[12.5px] leading-snug text-paper outline-none"
        />
      ) : (
        <p
          onClick={() => onEditing(pin.id)}
          title="Click to edit"
          className={cn('mt-1.5 cursor-text rounded px-1 py-0.5 text-[12.5px] leading-snug hover:bg-panel-hover/60', pin.resolved ? 'text-secondary line-through decoration-muted' : 'text-paper')}
        >
          “{pin.commentText}”
        </p>
      )}
      <div className="mt-1.5 flex items-center gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[10px] text-secondary">
          <input type="checkbox" checked={pin.resolved} onChange={(e) => onUpdate(pin.id, { resolved: e.target.checked })} className="h-3.5 w-3.5 accent-[#22C55E]" />
          Resolved
        </label>
        <button type="button" onClick={() => onCopy(pin.id)} title="Copy single comment" className="ml-auto rounded p-1 text-muted hover:bg-panel-hover hover:text-paper" aria-label="Copy comment">
          <Copy size={12} />
        </button>
        <button type="button" onClick={() => onDelete(pin.id)} title="Delete pin" className="rounded p-1 text-muted hover:bg-panel-hover hover:text-[#EF4444]" aria-label="Delete pin">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
});
