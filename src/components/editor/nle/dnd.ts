// VOLTA Editor — Edit mode drag-and-drop contract between the asset panel, the timeline and the preview.
// HTML5 DnD carries one of these payloads as JSON under its MIME type. OS files (Finder) arrive as dataTransfer.files.
import type { NleClip, NleTextStyle, NleTransitionType } from '@/types/nle';

/** A media asset: a bin item or an upload. */
export const DND_ASSET = 'application/x-volta-asset';
/** A preset: text template, transition, solid colour. */
export const DND_PRESET = 'application/x-volta-preset';

export interface DndAsset {
  id: string;
  url: string;
  name: string;
  media: 'video' | 'audio' | 'image';
  durationSec: number | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
}

export type DndPreset =
  | { kind: 'text'; label: string; duration: number; style: Partial<NleTextStyle>; transform?: Partial<NleClip['transform']> }
  | { kind: 'transition'; type: NleTransitionType; label: string; duration: number }
  | { kind: 'color'; label: string; color: string; duration: number };

export function setDrag(e: React.DragEvent, mime: typeof DND_ASSET | typeof DND_PRESET, payload: DndAsset | DndPreset): void {
  e.dataTransfer.setData(mime, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copy';
  // remember the payload kind for dragover (getData is empty until drop)
  currentDrag = { mime, payload };
}

/** The payload being dragged right now (set on dragstart in this window; cleared on dragend / drop). */
export let currentDrag: { mime: string; payload: DndAsset | DndPreset } | null = null;
export function clearDrag(): void {
  currentDrag = null;
}

export function readDrop(e: React.DragEvent): { asset: DndAsset } | { preset: DndPreset } | { files: File[] } | null {
  try {
    const a = e.dataTransfer.getData(DND_ASSET);
    if (a) return { asset: JSON.parse(a) as DndAsset };
    const p = e.dataTransfer.getData(DND_PRESET);
    if (p) return { preset: JSON.parse(p) as DndPreset };
  } catch {
    return null;
  }
  const files = Array.from(e.dataTransfer.files ?? []).filter((f) => /^(video|audio|image)\//.test(f.type));
  return files.length ? { files } : null;
}

export function isOurDrag(e: React.DragEvent): boolean {
  const t = Array.from(e.dataTransfer.types);
  return t.includes(DND_ASSET) || t.includes(DND_PRESET) || t.includes('Files');
}
