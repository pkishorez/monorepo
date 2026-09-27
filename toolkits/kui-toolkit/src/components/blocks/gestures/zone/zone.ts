import type { GestureEngine, Scroll, Side, TouchStart } from '../engine';
import { edgeStrips, type Environment } from '../../environment';
import { bindPointers } from './bind';
import { contains, zoneRect } from './geometry';
import { scrollEnds } from './scrollers';

export { swallowNextClick, ZONE_SELECTOR } from './bind';
export type { Rect } from './geometry';
export { nativeScrollers } from './scrollers';

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

/** The edge strip a point inside the element's bounds lies in, if any. */
const stripAt = (
  zone: ReturnType<typeof measureZone>,
  x: number,
  y: number,
  viewportWidth: number,
): Side | undefined => {
  if (!contains(zone.bounds, x, y) || contains(zone.rect, x, y)) {
    return undefined;
  }
  if (x <= zone.strips.left.width) return 'left';
  if (x >= viewportWidth - zone.strips.right.width) return 'right';
  return undefined;
};

/**
 * Makes an element a Gesture Zone for `engine`: pointers that go down
 * inside it, clear of the edge strips, are its own, and so are pointers in a
 * strip the app owns where an edge Swipe wants them (`wantsStrip`); the rest
 * stay the platform's. Each touch starts with the strip it started in and
 * the ends its scroller is at along `scroll`. Returns the unbind.
 */
export const bindZone = (
  element: HTMLElement,
  engine: GestureEngine,
  options: {
    readonly environment: () => Environment;
    readonly scroll: Scroll;
    readonly wantsStrip: (side: Side) => boolean;
  },
): (() => void) =>
  bindPointers(element, engine, (event): TouchStart | undefined => {
    const zone = measureZone(element, options.environment());
    const { clientX: x, clientY: y } = event;
    const inside = contains(zone.rect, x, y);
    const win = element.ownerDocument.defaultView ?? window;
    const strip = stripAt(zone, x, y, win.innerWidth);
    const edge =
      strip !== undefined &&
      zone.strips[strip].owner === 'app' &&
      options.wantsStrip(strip)
        ? strip
        : undefined;
    if (!inside && edge === undefined) return undefined;
    const ends =
      options.scroll === 'none' || !(event.target instanceof Element)
        ? []
        : scrollEnds(event.target, options.scroll);
    return { edge, ends };
  });
