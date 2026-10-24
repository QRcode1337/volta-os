'use client';
// ⌘K / Ctrl+K bridge. SearchPalette (mounted once in the root layout) owns the shortcut; other components
// open it with openSearchPalette() or recognise the chord with isPaletteShortcut() (GlobalShortcuts uses it to
// close its own overlay instead of handling the key twice).

export const SEARCH_EVENTS = {
  /** Open (or focus) the global palette. detail: { q?: string } */
  open: 'volta:search-palette-open',
  /** ⌘K pressed while /apps/search is open: focus that page's search box instead of opening the palette. */
  focusPage: 'volta:search-page-focus',
} as const;

export function isPaletteShortcut(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k';
}

export function openSearchPalette(q?: string): void {
  window.dispatchEvent(new CustomEvent(SEARCH_EVENTS.open, { detail: { q } }));
}
