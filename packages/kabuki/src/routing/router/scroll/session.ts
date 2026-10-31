import type { Positions } from './selector.ts';

/*
 * The browser's session storage, for the positions to outlast a reload:
 * one tab's own, copied when the tab is duplicated, empty in a new one.
 * Read once, written when the page is hidden. Storage that is full, or
 * missing, keeps nothing.
 */

export const STORAGE = '@kestack/kabuki/routing:scroll';

/** What the last page load in this tab saved, or nothing. */
export const read = (): Positions => {
  try {
    const saved: unknown = JSON.parse(
      globalThis.sessionStorage?.getItem(STORAGE) || '{}',
    );
    return saved && typeof saved === 'object' ? (saved as Positions) : {};
  } catch {
    return {};
  }
};

export const write = (positions: Positions) => {
  try {
    globalThis.sessionStorage?.setItem(STORAGE, JSON.stringify(positions));
  } catch {}
};
