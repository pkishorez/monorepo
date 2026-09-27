import type { Claim, Locked } from './decide';
import { measureGroup } from './group';
import type { PointerTracker } from './pointers';
import type {
  HoldEvent,
  MovementEvent,
  Phase,
  TapEvent,
  TouchStart,
  Track,
} from './types';

/** The public view of the Hold. */
export const holdOf = (hold: Locked | undefined) =>
  hold === undefined ? undefined : { side: hold.side, point: hold.point };

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
  const tracks = claim.ids.flatMap((id) => {
    const track = id === latest.id ? latest : context.pointers.get(id);
    return track === undefined ? [] : [track];
  });
  if (tracks.length === 0) return undefined;
  const group = measureGroup(tracks);
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
    fingers: tracks.length === 2 ? 2 : 1,
    hold: holdOf(context.hold),
    direction: claim.direction,
    point: group.current,
    offset: group.offset,
    velocity: { x: vx, y: vy },
    scale:
      claim.kind === 'pinch' && group.spreadDown > 0
        ? group.spread / group.spreadDown
        : 1,
    origin: group.down,
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

export const doubled = (tap: TapEvent): TapEvent => ({ ...tap, count: 2 });
