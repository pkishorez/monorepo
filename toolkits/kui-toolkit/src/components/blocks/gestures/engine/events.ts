import type { Claim, Locked } from './decide';
import { centroid, pointOf } from './group';
import type { PointerTracker } from './pointers';
import type {
  HoldEvent,
  MovementEvent,
  Phase,
  Point,
  TouchStart,
  Track,
} from './types';

/** The public view of the Hold. */
export const holdOf = (hold: Locked | undefined) =>
  hold === undefined ? undefined : { side: hold.side, point: hold.point };

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * A claim's travel and scale with `tracks` its fingers now: the leg's so far
 * plus what they made since it began. A Pinch's scale holds while it is down
 * to one finger.
 */
const measureClaim = (claim: Claim, tracks: ReadonlyArray<Track>) => {
  const { leg } = claim;
  const from = tracks.map((track) => leg.from[track.id] ?? track.current);
  const then = centroid(from);
  const now = centroid(tracks.map((track) => track.current));
  const offset = {
    x: leg.offset.x + now.x - then.x,
    y: leg.offset.y + now.y - then.y,
  };
  const [a, b] = tracks;
  const [fromA, fromB] = from;
  if (
    claim.kind !== 'pinch' ||
    a === undefined ||
    b === undefined ||
    fromA === undefined ||
    fromB === undefined
  ) {
    return { offset, scale: leg.scale };
  }
  const spreadFrom = distance(fromA, fromB);
  return {
    offset,
    scale:
      spreadFrom > 0
        ? (leg.scale * distance(a.current, b.current)) / spreadFrom
        : leg.scale,
  };
};

/**
 * The claim with its fingers changed to `ids`, one having lifted or landed
 * again: a new leg starts where its measures are, so they carry on without
 * a jump. `tracks` are its fingers just before the change.
 */
export const regroup = (
  claim: Claim,
  tracks: ReadonlyArray<Track>,
  ids: ReadonlyArray<number>,
  pointers: PointerTracker,
): Claim => {
  const { offset, scale } = measureClaim(claim, tracks);
  const from: Record<number, Point> = {};
  for (const id of ids) {
    const track = pointers.get(id);
    if (track !== undefined) from[id] = pointOf(track.current);
  }
  return { ...claim, ids, leg: { from, offset, scale } };
};

/** A claim's fingers, `latest` included even if it just lifted. */
export const claimTracks = (
  claim: Claim,
  pointers: PointerTracker,
  latest: Track,
): ReadonlyArray<Track> =>
  claim.ids.flatMap((id) => {
    const track = id === latest.id ? latest : pointers.get(id);
    return track === undefined ? [] : [track];
  });

/**
 * One phase of a claimed gesture, read from its own fingers only: `lifted`
 * is the pointer that just went up, no longer tracked. Velocity is read at
 * this event's time, so fingers held still before lifting read as a stop.
 */
export const movementEvent = (
  claim: Claim,
  phase: Phase,
  context: {
    readonly pointers: PointerTracker;
    readonly hold: Locked | undefined;
    readonly start: TouchStart | undefined;
  },
  latest: Track,
): MovementEvent | undefined => {
  const tracks = claimTracks(claim, context.pointers, latest);
  if (tracks.length === 0) return undefined;
  const { offset, scale } = measureClaim(claim, tracks);
  let vx = 0;
  let vy = 0;
  for (const track of tracks) {
    const velocity = context.pointers.velocity(track.id, latest.current.t);
    vx += velocity.x / tracks.length;
    vy += velocity.y / tracks.length;
  }
  return {
    kind: claim.kind,
    phase,
    fingers: claim.size,
    hold: holdOf(context.hold),
    direction: claim.direction,
    point: { x: claim.origin.x + offset.x, y: claim.origin.y + offset.y },
    offset,
    velocity: { x: vx, y: vy },
    scale,
    origin: claim.origin,
    edge: context.start?.edge,
  };
};

export const holdEvent = (
  phase: HoldEvent['phase'],
  hold: Locked,
): HoldEvent => ({
  kind: 'hold',
  phase,
  side: hold.side,
  point: hold.point,
});
