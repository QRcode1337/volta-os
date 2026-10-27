// Shared phone-navigation constants. Deliberately NOT a 'use client' module so server code (layout.tsx) can
// import the values; re-importing them from a client module would hand a server component a client reference.

/** Height of the fixed bottom tab bar in px, excluding the iOS safe-area inset. */
export const MOBILE_TABBAR_HEIGHT_PX = 56;

/** Dispatch on `window` to open the phone "More" sheet. */
export const MOBILE_MENU_OPEN_EVENT = 'volta:open-mobile-menu';

/** Fired by MobileMenu whenever it opens/closes. detail: { open: boolean } */
export const MOBILE_MENU_STATE_EVENT = 'volta:mobile-menu-state';

/** Below Tailwind `md` (768px). Keep in sync with the `md:hidden` classes on everything in this folder. */
export const MOBILE_MEDIA_QUERY = '(max-width: 767.98px)';
