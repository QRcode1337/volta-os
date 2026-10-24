'use client';
// Global keyboard → component bridge. The home shell (page.tsx) dispatches; widgets listen.
export const OS_EVENTS = {
  focusSearch: 'rubric:focus-search', // "/" pressed (not while typing)
  escape: 'rubric:escape', // Esc pressed — close any open modal/drawer/popover
} as const;

export function emitOsEvent(name: (typeof OS_EVENTS)[keyof typeof OS_EVENTS]): void {
  window.dispatchEvent(new CustomEvent(name));
}

/** True when the keyboard event target is a text field (skip global shortcuts). */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
