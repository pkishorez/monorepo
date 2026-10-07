import type { ZoneTree } from '@kstackz/use-gesture';

/** A Gesture Zone on a phone: the zone around it, and how deep it sits. */
export type Zone = { readonly parent: Zone | null; readonly depth: number };

/** Where a finger landed, in points on the screen: what the core calls its target. */
export type Point = { readonly x: number; readonly y: number };

// Every zone under a finger hears it land at the same point.
const SAME = 0.5;

const near = (a: Point, b: Point) =>
  Math.abs(a.x - b.x) <= SAME && Math.abs(a.y - b.y) <= SAME;

/**
 * How a surface's Gesture Zones nest, for use-gesture's core. Gesture
 * Handler says only where a finger is, not what it landed on, so each zone
 * inside the surface tells where fingers land in it (`land`), before the
 * surface feeds the same finger to the core. The innermost zone around a
 * finger is the deepest that heard it land there; the surface's own zone,
 * `root`, when none did. `forget` drops what was heard once every finger
 * has lifted.
 */
export const createZones = () => {
  const root: Zone = { parent: null, depth: 0 };
  let landings: ReadonlyArray<{ readonly zone: Zone; readonly at: Point }> = [];

  const tree: ZoneTree<Zone, Point> = {
    zoneOf: (point) =>
      landings
        .filter(({ at }) => near(at, point))
        .reduce(
          (deepest, { zone }) => (zone.depth > deepest.depth ? zone : deepest),
          root,
        ),
    parentOf: (zone) => zone.parent,
    trapped: () => false,
  };

  return {
    root,
    tree,
    /** A new zone inside `parent`. */
    inside: (parent: Zone): Zone => ({ parent, depth: parent.depth + 1 }),
    /** Fingers landed at `points` inside `zone`. */
    land: (zone: Zone, points: ReadonlyArray<Point>) => {
      landings = [...landings, ...points.map((at) => ({ zone, at }))];
    },
    forget: () => {
      landings = [];
    },
  };
};
