import {
  createGestureProvider,
  type GestureListener,
} from '@kstackz/use-gesture';
import { createFeed } from '../src/input/feed';
import { createZones, type Zone } from '../src/input/zones';

/**
 * A phone's touches as Gesture Handler reports them, through the input feed
 * into use-gesture's core, as a GestureSurface does: a finger landing in
 * GestureZones is told to each of them first, innermost or not, then fed.
 */
export const phone = () => {
  const zones = createZones();
  const provider = createGestureProvider(zones.tree);
  provider.addZone(zones.root);
  let now = 0;
  const feed = createFeed(provider.sink, () => (now += 16));
  const touch = (id: number, x: number, y: number) => ({
    changedTouches: [{ id, absoluteX: x, absoluteY: y }],
  });
  const fingers = new Set<number>();
  return {
    root: zones.root,
    /** A GestureZone inside `parent`, the surface's own by default. */
    zone: (parent: Zone = zones.root) => {
      const zone = zones.inside(parent);
      provider.addZone(zone);
      return zone;
    },
    listen: (listener: GestureListener<unknown>, zone: Zone = zones.root) =>
      provider.addGesture(zone, listener),
    /** A finger lands at (x, y), inside each of `inside`. */
    down: (
      id: number,
      x: number,
      y: number,
      inside: ReadonlyArray<Zone> = [],
    ) => {
      for (const zone of inside) zones.land(zone, [{ x, y }]);
      fingers.add(id);
      feed.down(touch(id, x, y));
    },
    move: (id: number, x: number, y: number) => feed.move(touch(id, x, y)),
    up: (id: number, x: number, y: number) => {
      feed.up(touch(id, x, y));
      fingers.delete(id);
      if (fingers.size === 0) zones.forget();
    },
    cancelled: () => {
      feed.cancelled();
      fingers.clear();
      zones.forget();
    },
    /** A finger sliding from (x, y) by (dx, dy) in `steps` moves. */
    slide: (
      id: number,
      from: { x: number; y: number },
      by: { dx: number; dy: number },
      steps = 6,
    ) => {
      for (let i = 1; i <= steps; i++) {
        feed.move(
          touch(id, from.x + (by.dx * i) / steps, from.y + (by.dy * i) / steps),
        );
      }
    },
  };
};
