'use client';
// VOLTA Editor — Edit mode timeline: track header (name, visibility, mute, lock, delete).
import { Eye, EyeOff, Film, Lock, LockOpen, Magnet, Music, Trash2, Volume2, VolumeX } from 'lucide-react';
import { memo, useState, type Dispatch } from 'react';
import { cn } from '@/lib/cn';
import type { NleTrack } from '@/types/nle';
import type { NleAction } from '../state';
import { HEADER_W } from './constants';

interface TrackHeaderProps {
  track: NleTrack;
  height: number;
  isMain: boolean;
  magnetic: boolean;
  canDelete: boolean;
  dispatch: Dispatch<NleAction>;
}

function IconBtn({ on, title, onClick, children, disabled, danger }: { on?: boolean; title: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-[20px] w-[20px] items-center justify-center rounded-[4px] transition-colors disabled:cursor-not-allowed disabled:opacity-30',
        on ? 'bg-orange/15 text-orange' : 'text-muted hover:bg-panel-hover hover:text-paper',
        danger && !disabled && 'hover:text-[#EF4444]',
      )}
    >
      {children}
    </button>
  );
}

export const TrackHeader = memo(function TrackHeader({ track, height, isMain, magnetic, canDelete, dispatch }: TrackHeaderProps) {
  const [editing, setEditing] = useState(false);
  const video = track.kind === 'video';
  const commitName = (v: string) => {
    setEditing(false);
    const name = v.trim();
    if (name && name !== track.name) dispatch({ type: 'UPDATE_TRACK', id: track.id, patch: { name } });
  };
  return (
    <div
      data-header
      className={cn('sticky left-0 z-20 flex shrink-0 flex-col justify-center gap-1 border-b border-r border-subtle px-2', isMain ? 'bg-panel-elevated' : 'bg-panel')}
      style={{ width: HEADER_W, height }}
    >
      {isMain && <span className="absolute inset-y-0 left-0 w-[2px] bg-orange/70" />}
      <div className="flex min-w-0 items-center gap-1.5">
        {video ? <Film size={11} className={cn('shrink-0', isMain ? 'text-orange' : 'text-teal')} /> : <Music size={11} className="shrink-0 text-green" />}
        {editing ? (
          <input
            autoFocus
            defaultValue={track.name}
            className="h-[18px] w-[72px] min-w-0 rounded-[3px] border border-orange bg-obsidian px-1 font-mono text-[10px] text-paper outline-none"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitName(e.currentTarget.value);
              if (e.key === 'Escape') setEditing(false);
            }}
            onBlur={(e) => commitName(e.currentTarget.value)}
          />
        ) : (
          <span className="min-w-0 cursor-text truncate font-mono text-[10.5px] font-semibold text-paper" onDoubleClick={() => setEditing(true)} title="Double-click to rename">
            {track.name}
          </span>
        )}
        {isMain && (
          <span className={cn('ml-auto flex shrink-0 items-center gap-0.5 rounded-[3px] px-1 py-[1px] font-mono text-[8.5px] font-bold uppercase tracking-wide', magnetic ? 'bg-orange/15 text-orange' : 'bg-panel-hover text-secondary')} title={magnetic ? 'Main track — magnetic (gap-free)' : 'Main track'}>
            {magnetic && <Magnet size={9} />}Main
          </span>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        {video && (
          <IconBtn on={track.hidden} title={track.hidden ? 'Show track' : 'Hide track'} onClick={() => dispatch({ type: 'UPDATE_TRACK', id: track.id, patch: { hidden: !track.hidden } })}>
            {track.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
          </IconBtn>
        )}
        <IconBtn on={track.muted} title={track.muted ? 'Unmute track' : 'Mute track'} onClick={() => dispatch({ type: 'UPDATE_TRACK', id: track.id, patch: { muted: !track.muted } })}>
          {track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
        </IconBtn>
        <IconBtn on={track.locked} title={track.locked ? 'Unlock track' : 'Lock track'} onClick={() => dispatch({ type: 'UPDATE_TRACK', id: track.id, patch: { locked: !track.locked } })}>
          {track.locked ? <Lock size={12} /> : <LockOpen size={12} />}
        </IconBtn>
        <span className="ml-auto" />
        <IconBtn title={canDelete ? 'Delete track (and its clips)' : `Can't delete the last ${track.kind} track`} disabled={!canDelete} danger onClick={() => dispatch({ type: 'REMOVE_TRACK', id: track.id })}>
          <Trash2 size={11} />
        </IconBtn>
      </div>
    </div>
  );
});
