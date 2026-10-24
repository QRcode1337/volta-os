'use client';

import { useEffect, useState } from 'react';
import { OS_EVENTS, emitOsEvent, isTypingTarget } from '@/lib/events';
import { isPaletteShortcut } from '@/components/search/palette-events';
import { ShortcutsHelp } from './ShortcutsHelp';

/**
 * Home-shell keyboard bridge (INTEGRATION_CONTRACTS §4):
 *  "/"   (not while typing) → focusSearch event
 *  Esc                        → escape event (and closes the help overlay)
 *  "?"   (not while typing) → toggles the keyboard-shortcuts overlay
 *  ⌘K / Ctrl+K (anywhere)     → VOLTA Search palette. The palette is mounted once in the root layout and owns
 *                               the chord on every page; here it only closes the help overlay so the two never stack.
 */
export function GlobalShortcuts() {
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHelpOpen(false);
        emitOsEvent(OS_EVENTS.escape);
        return;
      }
      if (isPaletteShortcut(e)) {
        setHelpOpen(false); // SearchPalette (root layout) opens on this chord
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === '/') {
        e.preventDefault();
        setHelpOpen(false);
        emitOsEvent(OS_EVENTS.focusSearch);
      } else if (e.key === '?') {
        e.preventDefault();
        setHelpOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />;
}

export default GlobalShortcuts;
