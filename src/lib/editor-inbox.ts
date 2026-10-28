'use client';
// Cross-app hand-off into VOLTA Editor. Producers: Generations, Studio and Music (real files: `mediaUrl` = /api/media/file, /api/studio/file or /api/music/file),
// plus Scripts and Carousels (no file: the Editor lists them as hand-offs without media). Consumer: Editor.
// Items are built with makeInboxItem and the storage key lives in lib/media-ids; this module only reads and writes the queue.
import type { EditorInboxItem } from '@/types/os';
import { EDITOR_INBOX_KEY } from './media-ids';

export const EDITOR_INBOX_EVENT = 'rubric:editor-inbox-updated';

export function readEditorInbox(): EditorInboxItem[] {
  try {
    const raw = window.localStorage.getItem(EDITOR_INBOX_KEY);
    return raw ? (JSON.parse(raw) as EditorInboxItem[]) : [];
  } catch {
    return [];
  }
}

export function pushToEditorInbox(items: EditorInboxItem | EditorInboxItem[]): number {
  const next = [...readEditorInbox(), ...(Array.isArray(items) ? items : [items])];
  try {
    window.localStorage.setItem(EDITOR_INBOX_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EDITOR_INBOX_EVENT));
  } catch {
    // storage unavailable (private mode) — caller still gets the count
  }
  return next.length;
}

/** Editor keeps only the hand-offs it could not open as real files (no file id / url); everything else is consumed. */
export function replaceEditorInbox(items: EditorInboxItem[]): void {
  try {
    if (items.length) window.localStorage.setItem(EDITOR_INBOX_KEY, JSON.stringify(items));
    else window.localStorage.removeItem(EDITOR_INBOX_KEY);
  } catch {
    // ignore
  }
}

/** Editor calls this after importing the items into its clip bin. */
export function clearEditorInbox(): void {
  try {
    window.localStorage.removeItem(EDITOR_INBOX_KEY);
  } catch {
    // ignore
  }
}
