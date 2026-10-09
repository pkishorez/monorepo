import { flushSync } from 'react-dom';

/*
 * Run a DOM change inside a View Transition, with the browser's own API.
 *
 * The browser snapshots the page, calls `update`, and animates to whatever
 * the DOM is once `update` returns. So the change must reach the DOM
 * synchronously: `send` hands the Message to the Runtime, which handles it at
 * once and tells the Views, and `flushSync` makes React draw it before
 * returning. Without View Transitions, or with reduced motion, the change
 * just happens.
 */
export const animate = (
  types: ReadonlyArray<string>,
  change: () => void,
): void => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('startViewTransition' in document) || reduced) {
    change();
    return;
  }
  document.startViewTransition({
    update: () => flushSync(change),
    types: [...types],
  });
};
