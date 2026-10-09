import { Effect } from 'effect';
import type { KeyboardEvent } from 'react';

/*
 * Focus is DOM state, outside the Nodes. Moving it is work on the outside
 * world, so it is a Command, as in Foldkit: Replay drops Commands, so
 * scrubbing the timeline never steals focus. Each Command waits for the next
 * animation frame, by which time React has drawn what the Update changed.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

const afterDraw = (run: () => void) =>
  Effect.sync(() => {
    requestAnimationFrame(run);
  });

/** Focuses the element with this id. */
export const focusId = (id: string) =>
  afterDraw(() => document.getElementById(id)?.focus());

/** Focuses the first focusable element inside the element with this id. */
export const focusFirstIn = (id: string) =>
  afterDraw(() =>
    document.getElementById(id)?.querySelector<HTMLElement>(FOCUSABLE)?.focus(),
  );

/** Keeps Tab and Shift+Tab inside the element handling the key. */
export const trapTab = (event: KeyboardEvent<HTMLElement>) => {
  if (event.key !== 'Tab') return;
  const all = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = all[0];
  const last = all.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

/**
 * Where a list's active item moves on a key: Arrow keys step and wrap,
 * Home and End jump. Null when the key does not move it.
 */
export const stepActive = (
  active: number | null,
  key: string,
  count: number,
  keys: { readonly next: string; readonly previous: string } = {
    next: 'ArrowDown',
    previous: 'ArrowUp',
  },
): number | null => {
  if (count === 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === keys.next) return active === null ? 0 : (active + 1) % count;
  if (key === keys.previous)
    return active === null ? count - 1 : (active - 1 + count) % count;
  return null;
};

/** Whether focus is leaving `event.currentTarget` for somewhere outside it. */
export const leftFor = (event: {
  readonly currentTarget: Element;
  readonly relatedTarget: EventTarget | null;
}) =>
  !(
    event.relatedTarget instanceof Node &&
    event.currentTarget.contains(event.relatedTarget)
  );
