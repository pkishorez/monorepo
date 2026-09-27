import type { GestureEngine } from '../engine';
import type { Environment } from '../environment';
import { bindPointers, swallowNextClick } from './bind';
import { edgeStrips } from './edges';
import { contains, zoneRect } from './geometry';

export { ANDROID_EDGE_STRIP_PX, EDGE_STRIP_PX, edgeStrips } from './edges';
export type { EdgeOwner, EdgeStrips } from './edges';
export type { Rect } from './geometry';
export { nativeScrollers } from './scrollers';
export { swallowNextClick };

/**
 * Where an element's Gesture Zone is right now, in viewport coordinates: the
 * element's `bounds`, the zone `rect` inside them, and who owns the edges.
 */
export const measureZone = (element: HTMLElement, environment: Environment) => {
  const win = element.ownerDocument.defaultView ?? window;
  const strips = edgeStrips(environment);
  const bounds = element.getBoundingClientRect();
  return { strips, bounds, rect: zoneRect(bounds, win.innerWidth, strips) };
};

/**
 * Makes an element a Gesture Zone for `engine`: pointers that go down inside
 * it, clear of the edge strips, are recognized; the rest stay the platform's.
 * Returns the unbind.
 */
export const bindZone = (
  element: HTMLElement,
  engine: GestureEngine,
  environment: () => Environment,
): (() => void) =>
  bindPointers(element, engine, (x, y) =>
    contains(measureZone(element, environment()).rect, x, y),
  );
