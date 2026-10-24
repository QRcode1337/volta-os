'use client';
// Cross-app hand-off into VOLTA Editor. Producers: Generations, Scripts, Carousels. Consumer: Editor.
import type { EditorInboxItem } from '@/types/os';

export const EDITOR_INBOX_KEY = 'rubric:editor-inbox';
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

/** Editor calls this after importing the items into its clip bin. */
export function clearEditorInbox(): void {
  try {
    window.localStorage.removeItem(EDITOR_INBOX_KEY);
  } catch {
    // ignore
  }
}
