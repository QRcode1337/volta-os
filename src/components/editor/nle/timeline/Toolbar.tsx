'use client';
// VOLTA Editor — Edit mode timeline toolbar. Shortcuts in tooltips are bound by the workspace, not here.
import { AudioLines, CopyPlus, Delete, Film, Flag, Magnet, Maximize2, MousePointer2, Music, Redo2, Scissors, SquareSplitHorizontal, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/cn';
import { MAX_PPS, MIN_PPS } from './constants';

export type ToolbarCmd =
  | 'undo'
  | 'redo'
  | 'select'
  | 'blade'
  | 'split'
  | 'delete'
  | 'ripple'
  | 'duplicate'
  | 'detach'
  | 'marker'
  | 'snap'
  | 'magnetic'
  | 'addVideo'
  | 'addAudio'
  | 'zoomIn'
  | 'zoomOut'
  | 'fit';

interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  tool: 'select' | 'blade';
  snap: boolean;
  magnetic: boolean;
  hasSelection: boolean;
  canDetach: boolean;
  pps: number;
  onCmd: (c: ToolbarCmd) => void;
  onZoom: (pps: number) => void;
}

function Btn({ title, onClick, disabled, active, children }: { title: string; onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-[24px] min-w-[24px] items-center justify-center gap-1 rounded-[5px] px-1 transition-colors disabled:cursor-not-allowed disabled:opacity-30',
        active ? 'bg-orange/15 text-orange ring-1 ring-inset ring-orange/40' : 'text-secondary hover:bg-panel-hover hover:text-paper',
      )}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-1 h-4 w-px shrink-0 bg-subtle" />;

const LOG_RANGE = Math.log(MAX_PPS / MIN_PPS);

export const Toolbar = memo(function Toolbar({ canUndo, canRedo, tool, snap, magnetic, hasSelection, canDetach, pps, onCmd, onZoom }: ToolbarProps) {
  const slider = Math.log(pps / MIN_PPS) / LOG_RANGE;
  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-subtle px-2 hud-scroll">
      <Btn title="Undo (⌘Z)" disabled={!canUndo} onClick={() => onCmd('undo')}>
        <Undo2 size={14} />
      </Btn>
      <Btn title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={() => onCmd('redo')}>
        <Redo2 size={14} />
      </Btn>
      <Sep />
      <Btn title="Select tool (A)" active={tool === 'select'} onClick={() => onCmd('select')}>
        <MousePointer2 size={14} />
      </Btn>
      <Btn title="Blade tool (B) — click a clip to cut it" active={tool === 'blade'} onClick={() => onCmd('blade')}>
        <Scissors size={14} />
      </Btn>
      <Sep />
      <Btn title="Split at playhead (S or ⌘B)" onClick={() => onCmd('split')}>
        <SquareSplitHorizontal size={14} />
      </Btn>
      <Btn title="Delete (⌫)" disabled={!hasSelection} onClick={() => onCmd('delete')}>
        <Trash2 size={14} />
      </Btn>
      <Btn title="Ripple delete — close the gap (⇧⌫)" disabled={!hasSelection} onClick={() => onCmd('ripple')}>
        <Delete size={14} />
      </Btn>
      <Btn title="Duplicate (⌘D) · Copy / Paste (⌘C / ⌘V)" disabled={!hasSelection} onClick={() => onCmd('duplicate')}>
        <CopyPlus size={14} />
      </Btn>
      <Btn title="Detach audio from the selected video" disabled={!canDetach} onClick={() => onCmd('detach')}>
        <AudioLines size={14} />
      </Btn>
      <Btn title="Add marker at playhead (M)" onClick={() => onCmd('marker')}>
        <Flag size={14} />
      </Btn>
      <Sep />
      <Btn title={`Snapping ${snap ? 'on' : 'off'} (N)`} active={snap} onClick={() => onCmd('snap')}>
        <span className="font-mono text-[10px] font-bold tracking-wide">SNAP</span>
      </Btn>
      <Btn title={`Main track magnet ${magnetic ? 'on' : 'off'} — keeps the main track gap-free`} active={magnetic} onClick={() => onCmd('magnetic')}>
        <Magnet size={14} />
      </Btn>
      <Sep />
      <Btn title="Add video track" onClick={() => onCmd('addVideo')}>
        <Film size={13} />
        <span className="font-mono text-[10px]">+</span>
      </Btn>
      <Btn title="Add audio track" onClick={() => onCmd('addAudio')}>
        <Music size={13} />
        <span className="font-mono text-[10px]">+</span>
      </Btn>
      <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
        <Btn title="Zoom out (⌘-)" onClick={() => onCmd('zoomOut')}>
          <ZoomOut size={14} />
        </Btn>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={Number.isFinite(slider) ? Math.max(0, Math.min(1, slider)) : 0}
          onChange={(e) => onZoom(MIN_PPS * Math.exp(Number(e.target.value) * LOG_RANGE))}
          className="h-1 w-28 accent-[#FF5500]"
          aria-label="Timeline zoom"
          title="Zoom (⌘/Ctrl + wheel, pinch)"
        />
        <Btn title="Zoom in (⌘=)" onClick={() => onCmd('zoomIn')}>
          <ZoomIn size={14} />
        </Btn>
        <Btn title="Fit to window (⇧Z)" onClick={() => onCmd('fit')}>
          <Maximize2 size={13} />
        </Btn>
      </div>
    </div>
  );
});
