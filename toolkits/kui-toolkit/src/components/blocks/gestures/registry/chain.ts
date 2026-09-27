import type {
  Combination,
  Direction,
  MovementEvent,
  Side,
  TapEvent,
} from '../engine';
import {
  holdMatches,
  holdsOverlap,
  isMover,
  matches,
  type Registration,
  stripOf,
} from './registration';

/** One zone's registrations, linked to the zone around it. */
export type Node = {
  readonly own: ReadonlySet<Registration>;
  readonly parent: Node | undefined;
  readonly appOwnsEdges: () => boolean;
};

/** The zone and every zone around it, innermost first. */
export const chainOf = (node: Node): ReadonlyArray<Node> => {
  const chain: Array<Node> = [];
  for (let at: Node | undefined = node; at !== undefined; at = at.parent) {
    chain.push(at);
  }
  return chain;
};

const every = (node: Node): ReadonlyArray<Registration> =>
  chainOf(node).flatMap((at) => [...at.own]);

/** The first zone, innermost first, with hooks `pick` keeps; those hooks. */
const innermost = (
  node: Node,
  pick: (registration: Registration, at: Node) => boolean,
): ReadonlyArray<Registration> => {
  for (const at of chainOf(node)) {
    const picked = [...at.own].filter((registration) => pick(registration, at));
    if (picked.length > 0) return picked;
  }
  return [];
};

/**
 * Whether an edge Swipe falling back to a zone Swipe is on: off when another
 * hook in its zone or around it already takes that combination and direction.
 */
export const fallbackOn = (
  node: Node,
  swipe: Extract<Registration, { gesture: 'swipe' }>,
): boolean => {
  const at = chainOf(node).find((candidate) => candidate.own.has(swipe));
  if (at === undefined) return false;
  return !every(at).some(
    (other) =>
      other !== swipe &&
      isMover(other) &&
      other.enabled() &&
      other.fingers === swipe.fingers &&
      holdsOverlap(other.hold, swipe.hold) &&
      (other.gesture === 'pan' || other.direction === swipe.direction),
  );
};

/**
 * Whether a Swipe takes a movement toward `direction` from a touch that
 * started in edge strip `edge`. Strip touches only open edge Swipes. Where
 * the app owns the edges an edge Swipe opens only from its strip; elsewhere
 * it opens from anywhere in the zone, unless its fallback is off.
 */
const takes = (
  swipe: Extract<Registration, { gesture: 'swipe' }>,
  direction: Direction,
  edge: Side | undefined,
  at: Node,
): boolean => {
  if (!swipe.directions().includes(direction)) return false;
  if (direction !== swipe.direction) return swipe.edge || edge === undefined;
  if (!swipe.edge) return edge === undefined;
  if (at.appOwnsEdges()) return edge === stripOf(swipe.direction);
  return edge === undefined && fallbackOn(at, swipe);
};

/**
 * The open `stay` Swipes whose way back is `direction`, in the outermost
 * zone that has any: an open drawer is on top of what is inside it, so
 * closing it comes before anything there.
 */
const closers = (
  node: Node,
  combination: Combination,
  direction: Direction,
  edge: Side | undefined,
): ReadonlyArray<Registration> => {
  for (const at of [...chainOf(node)].reverse()) {
    const open = [...at.own].filter(
      (registration) =>
        registration.gesture === 'swipe' &&
        matches(registration, combination) &&
        registration.opened() &&
        direction !== registration.direction &&
        takes(registration, direction, edge, at),
    );
    if (open.length > 0) return open;
  }
  return [];
};

/**
 * What a movement becomes and whose it is. An open `stay` Swipe's way back
 * comes first, from the outermost zone. Otherwise the innermost zone that
 * wants it: in a zone, a Swipe claims its own directions and a Pan for the
 * combination gets the rest. A zone with neither passes it out to the zone
 * around it, so an inner zone's Pan or Swipe always wins over an outer
 * zone's edge fallback.
 */
export const moverFor = (
  node: Node,
  combination: Combination,
  direction: Direction,
  edge: Side | undefined,
):
  | {
      readonly kind: 'pan' | 'swipe';
      readonly targets: ReadonlyArray<Registration>;
    }
  | undefined => {
  const closing = closers(node, combination, direction, edge);
  if (closing.length > 0) return { kind: 'swipe', targets: closing };
  for (const at of chainOf(node)) {
    const movers = [...at.own].filter(
      (registration) =>
        isMover(registration) && matches(registration, combination),
    );
    const swipes = movers.filter(
      (registration) =>
        registration.gesture === 'swipe' &&
        takes(registration, direction, edge, at),
    );
    if (swipes.length > 0) return { kind: 'swipe', targets: swipes };
    const pans = movers.filter(
      (registration) => registration.gesture === 'pan',
    );
    if (pans.length > 0 && edge === undefined) {
      return { kind: 'pan', targets: pans };
    }
  }
  return undefined;
};

export const pinchesFor = (node: Node, hold: Side | undefined) =>
  innermost(
    node,
    (registration) =>
      registration.gesture === 'pinch' &&
      registration.enabled() &&
      holdMatches(registration.hold, hold),
  );

export const tapsFor = (node: Node, tap: TapEvent) =>
  innermost(
    node,
    (registration) =>
      registration.gesture === 'tap' &&
      registration.count === tap.count &&
      matches(registration, { fingers: tap.fingers, hold: tap.hold?.side }),
  );

export const doubleTapIn = (node: Node, combination: Combination) =>
  every(node).some(
    (registration) =>
      registration.gesture === 'tap' &&
      registration.count === 2 &&
      matches(registration, combination),
  );

/** The hooks a movement's start goes to, and stays with until it ends. */
export const targetsOf = (
  node: Node,
  event: MovementEvent,
): ReadonlyArray<Registration> => {
  const hold = event.hold?.side;
  if (event.kind === 'pinch') return pinchesFor(node, hold);
  if (event.direction === undefined) return [];
  const mover = moverFor(
    node,
    { fingers: event.fingers, hold },
    event.direction,
    event.edge,
  );
  return mover?.kind === event.kind ? mover.targets : [];
};

/**
 * Whether an edge strip should be listened in: the app owns it, and an edge
 * Swipe opens from it or is open and may be closed from anywhere.
 */
export const wantsStrip = (node: Node, side: Side): boolean =>
  node.appOwnsEdges() &&
  every(node).some(
    (registration) =>
      registration.gesture === 'swipe' &&
      registration.edge &&
      registration.enabled() &&
      (stripOf(registration.direction) === side || registration.opened()),
  );

/** Every hook in the chain that can catch an animation. */
export const catchersOf = (node: Node) =>
  every(node).filter(
    (registration) =>
      registration.enabled() && registration.catch !== undefined,
  );
