import type { Scroll } from '../engine';
import {
  describe,
  holdsOverlap,
  isMover,
  type Registration,
} from './registration';

// Vite and Vitest set this; anywhere else the checks stay silent.
const development =
  (import.meta as { readonly env?: { readonly DEV?: boolean } }).env?.DEV ===
  true;

/**
 * The mistakes a zone refuses in development, thrown as the hook mounts: a
 * one-finger Pan along the scroll axis the browser keeps, an edge Swipe that
 * is not one finger sideways. A free Pan sharing a combination with a Swipe
 * only warns: the Swipe takes its directions and the Pan gets the rest, which
 * is easy to do by accident. Silent in production.
 */
export const checkRegistration = (
  registration: Registration,
  zone: { readonly own: ReadonlySet<Registration>; readonly scroll: Scroll },
): void => {
  if (!development) return;
  const freePan = (candidate: Registration) =>
    candidate.gesture === 'pan' && candidate.axis === undefined;
  if (
    isMover(registration) &&
    [...zone.own].some(
      (other) =>
        isMover(other) &&
        other.gesture !== registration.gesture &&
        (freePan(other) || freePan(registration)) &&
        other.fingers === registration.fingers &&
        holdsOverlap(other.hold, registration.hold),
    )
  ) {
    console.warn(
      `usePan without an axis and useSwipe are both registered for ${describe(registration)} in one Gesture Zone. The Swipe takes its directions and the Pan only gets the rest; give the Pan an axis if that is what you mean.`,
    );
  }
  if (
    registration.gesture === 'pan' &&
    registration.fingers === 1 &&
    registration.hold === 'none' &&
    zone.scroll !== 'none' &&
    (registration.axis === undefined || registration.axis === zone.scroll)
  ) {
    throw new Error(
      `usePan with one finger and no Hold moves along the Gesture Zone's scroll axis (${zone.scroll}), which the browser keeps for scrolling. Give it axis: '${zone.scroll === 'y' ? 'x' : 'y'}', a Hold or two fingers, use useSwipe, or set scroll="none" on the zone.`,
    );
  }
  if (
    registration.gesture === 'swipe' &&
    registration.edge &&
    (registration.fingers !== 1 ||
      registration.hold !== 'none' ||
      registration.direction === 'up' ||
      registration.direction === 'down')
  ) {
    throw new Error(
      `useSwipe with edge: true must be one finger, no Hold, left or right: only the side edges are offered.`,
    );
  }
};

/** Warns once per hook, in development, when an edge Swipe's fallback is off. */
export const warnFallbackOff = (direction: string): void => {
  if (!development) return;
  console.warn(
    `useSwipe({ direction: '${direction}', edge: true }): this Environment keeps the edge, and another hook in the zone chain already takes a Swipe ${direction} for one finger with no Hold, so the fallback from anywhere in the zone is off.`,
  );
};
