import {
  alongScroll,
  centroid,
  directionOf,
  isPinch,
  measureGroup,
  pointOf,
  sideOf,
} from './group';
import type { PointerTracker } from './pointers';
import { FRAME_MS, HOLD_STILL_SHARE, SLOP_PX, TAP_MAX_MS } from './thresholds';
import type {
  Direction,
  Fingers,
  Point,
  Policy,
  Scroll,
  Side,
  TapEvent,
  TouchStart,
  Track,
} from './types';

/** What a decision reads: the machine's context, narrowed. */
export type Situation = {
  readonly pointers: PointerTracker;
  readonly policy: Policy;
  readonly scroll: Scroll;
  readonly start: TouchStart | undefined;
  /** Captured already: the browser cannot scroll this touch any more. */
  readonly captured: boolean;
  readonly hold: Locked | undefined;
};

/** The Hold as the machine keeps it: which pointer, its side, where it is. */
export type Locked = {
  readonly id: number;
  readonly side: Side;
  readonly point: Point;
};

/**
 * The stretch of a claim since its fingers last changed: where each of them
 * was as it began, and the travel and scale the claim had made before it.
 */
export type Leg = {
  readonly from: Readonly<Record<number, Point>>;
  readonly offset: Point;
  readonly scale: number;
};

/**
 * A claimed Pan, Swipe or Pinch. It lasts until the last of its fingers
 * lifts: one lifting leaves the rest making it, and one landing again joins
 * back, up to the number it started with.
 */
export type Claim = {
  readonly kind: 'pan' | 'swipe' | 'pinch';
  readonly direction: Direction | undefined;
  /** The fingers making it now. */
  readonly ids: ReadonlyArray<number>;
  /** How many fingers it started with. */
  readonly size: Fingers;
  /** Where its fingers went down, which its travel is measured from. */
  readonly origin: Point;
  readonly leg: Leg;
};

/** A finger of the press that lifted quickly, not having moved. */
export type Tapper = {
  readonly point: Point;
  readonly down: number;
  readonly up: number;
};

/** The fingers pressed since the last gesture: who tapped, and whether a tap is still possible. */
export type Press = {
  readonly tappers: ReadonlyArray<Tapper>;
  readonly spoiled: boolean;
};

export const FRESH_PRESS: Press = { tappers: [], spoiled: false };

/** What the first movement past the slop makes of the touch. */
export type Decision =
  | { readonly next: 'native' | 'ignoring' }
  | { readonly next: 'moving'; readonly claim: Claim };

const pastSlop = (track: Track) => track.travel > SLOP_PX;

const quick = (press: Press, track: Track) =>
  !press.spoiled &&
  !pastSlop(track) &&
  track.current.t - track.down.t <= TAP_MAX_MS;

/** A Pinch, Pan or Swipe of the acting fingers, if anyone registered it. */
const claimGroup = (
  situation: Situation,
  tracks: ReadonlyArray<Track>,
  hold: Side | undefined,
): Claim | undefined => {
  const group = measureGroup(tracks);
  const fingers = tracks.length === 2 ? 2 : 1;
  const claim = (
    kind: Claim['kind'],
    direction: Direction | undefined,
  ): Claim => ({
    kind,
    direction,
    ids: tracks.map((track) => track.id),
    size: fingers,
    origin: group.down,
    leg: {
      from: Object.fromEntries(
        tracks.map((track) => [track.id, pointOf(track.down)]),
      ),
      offset: { x: 0, y: 0 },
      scale: 1,
    },
  });
  if (tracks.length === 2 && isPinch(group)) {
    return situation.policy.pinch(hold) ? claim('pinch', undefined) : undefined;
  }
  const direction = directionOf(group.offset);
  const kind = situation.policy.movement(
    { fingers, hold },
    direction,
    hold === undefined ? situation.start?.edge : undefined,
  );
  return kind === undefined ? undefined : claim(kind, direction);
};

/**
 * One finger, no Hold. Along the scroll axis the browser keeps it, unless a
 * Swipe that way is registered and the scroller is at its end that way (so
 * pull to refresh works on a scrolling feed). Once Captured the browser
 * cannot scroll it, so every direction is the app's.
 */
const decideSingle = (situation: Situation, track: Track): Decision => {
  const direction = directionOf(measureGroup([track]).offset);
  const claim = claimGroup(situation, [track], undefined);
  if (!situation.captured && alongScroll(direction, situation.scroll)) {
    const atEnd = situation.start?.ends.includes(direction) ?? false;
    return claim?.kind === 'swipe' && atEnd
      ? { next: 'moving', claim }
      : { next: 'native' };
  }
  return claim === undefined ? { next: 'ignoring' } : { next: 'moving', claim };
};

/**
 * Whether several fingers down are ready to be read: one passed the slop in
 * an earlier frame than `moved`'s. A browser may deliver one finger's move of
 * a frame before another's, so the frame it passed the slop in is read whole.
 */
const settled = (tracks: ReadonlyArray<Track>, moved: Track): boolean =>
  tracks.some(
    (track) =>
      track.slopAt !== undefined && moved.current.t - track.slopAt > FRAME_MS,
  );

/**
 * What the touch becomes when it first moves past the slop, with no Hold:
 * one finger pans or swipes; two that did not make a Hold Pinch or pan.
 * Anything else is ignored until every finger lifts.
 */
export const decideMovement = (
  situation: Situation,
  moved: Track,
): Decision | undefined => {
  const tracks = situation.pointers.list();
  const [only, ...others] = tracks;
  if (only === undefined) return undefined;
  if (others.length === 0) {
    return pastSlop(only) ? decideSingle(situation, only) : undefined;
  }
  if (!settled(tracks, moved)) return undefined;
  if (others.length > 1) return { next: 'ignoring' };
  const claim = claimGroup(situation, tracks, undefined);
  return claim === undefined ? { next: 'ignoring' } : { next: 'moving', claim };
};

const lockOf = (held: Track, acting: ReadonlyArray<Point>): Locked => ({
  id: held.id,
  side: sideOf(held.current, centroid(acting)),
  point: pointOf(held.current),
});

/**
 * The Hold the fingers' first movement past the slop locks, with no Hold
 * yet: the first finger down, still beside the one or two that landed after
 * it, having moved no more than a share of their travel.
 */
export const lockOnMovement = (
  situation: Situation,
  moved: Track,
): Locked | undefined => {
  if (situation.hold !== undefined) return undefined;
  const tracks = situation.pointers.list();
  const [held, ...acting] = tracks;
  if (held === undefined || acting.length === 0 || acting.length > 2) {
    return undefined;
  }
  if (!settled(tracks, moved) || pastSlop(held)) return undefined;
  const travel = Math.max(...acting.map((track) => track.travel));
  if (held.travel > travel * HOLD_STILL_SHARE) return undefined;
  return lockOf(
    held,
    acting.map((track) => track.current),
  );
};

/**
 * The Hold a tap locks as it lifts, with no Hold yet: the first finger down,
 * still, beside a quick finger that landed after it, once the tap time since
 * the first landed has run out, so the two can no longer tap together.
 */
export const lockOnLift = (
  situation: Situation,
  press: Press,
  lifted: Track,
): Locked | undefined => {
  if (situation.hold !== undefined || !quick(press, lifted)) return undefined;
  const [held, ...rest] = situation.pointers.list();
  if (held === undefined || pastSlop(held) || held.down.t > lifted.down.t) {
    return undefined;
  }
  if (lifted.current.t - held.down.t <= TAP_MAX_MS) return undefined;
  return lockOf(held, [lifted.current, ...rest.map((track) => track.current)]);
};

/**
 * The Hold a tap locks as the tap time since the first finger landed runs
 * out, with no Hold yet: the first finger down, still, beside quick fingers
 * that landed after it and already lifted.
 */
export const lockOnExpiry = (
  situation: Situation,
  press: Press,
): Locked | undefined => {
  if (
    situation.hold !== undefined ||
    press.spoiled ||
    press.tappers.length === 0
  ) {
    return undefined;
  }
  const [held, ...rest] = situation.pointers.list();
  if (held === undefined || pastSlop(held)) return undefined;
  if (press.tappers.some((tapper) => tapper.down < held.down.t)) {
    return undefined;
  }
  return lockOf(held, [
    ...press.tappers.map((tapper) => tapper.point),
    ...rest.map((track) => track.current),
  ]);
};

/** The acting fingers under a Hold: every pointer but the held one. */
export const actingTracks = (situation: Situation): ReadonlyArray<Track> =>
  situation.pointers.list().filter((track) => track.id !== situation.hold?.id);

/** A Pinch, Pan or Swipe of the acting fingers under a Hold, if anyone registered it. */
export const claimActing = (situation: Situation): Claim | undefined => {
  const acting = actingTracks(situation);
  return acting.length > 2 || situation.hold === undefined
    ? undefined
    : claimGroup(situation, acting, situation.hold.side);
};

/** What the acting fingers' first movement past the slop becomes, under a Hold. */
export const decideActing = (
  situation: Situation,
  moved: Track,
):
  | { readonly next: 'moving'; readonly claim: Claim }
  | { readonly next: 'ignoring' }
  | undefined => {
  const hold = situation.hold;
  if (hold === undefined || moved.id === hold.id || !pastSlop(moved)) {
    return undefined;
  }
  const claim = claimActing(situation);
  return claim === undefined ? { next: 'ignoring' } : { next: 'moving', claim };
};

/**
 * Whether one finger still inside the slop is heading for a Swipe the app
 * would claim at a scroller's end: its moves are held back from the browser
 * already, so the browser does not start scrolling before the slop is passed.
 */
export const leans = (situation: Situation, moved: Track): boolean => {
  const tracks = situation.pointers.list();
  if (tracks.length !== 1 || situation.captured || moved.travel < 1) {
    return false;
  }
  const direction = directionOf(measureGroup([moved]).offset);
  return (
    alongScroll(direction, situation.scroll) &&
    (situation.start?.ends.includes(direction) ?? false) &&
    claimGroup(situation, [moved], undefined)?.kind === 'swipe'
  );
};

/** A tap of one or two fingers, if they all lifted within the tap time of the first landing. */
export const tapOf = (
  tappers: ReadonlyArray<Tapper>,
  hold: Locked | undefined,
): TapEvent | undefined => {
  if (tappers.length === 0 || tappers.length > 2) return undefined;
  const first = Math.min(...tappers.map((tapper) => tapper.down));
  const last = Math.max(...tappers.map((tapper) => tapper.up));
  if (last - first > TAP_MAX_MS) return undefined;
  return {
    kind: 'tap',
    fingers: tappers.length === 2 ? 2 : 1,
    hold:
      hold === undefined ? undefined : { side: hold.side, point: hold.point },
    point: centroid(tappers.map((tapper) => tapper.point)),
  };
};

/** What a finger lifting does to a press with no Hold. */
export type Lift =
  | { readonly next: 'tap'; readonly tap: TapEvent }
  | { readonly next: 'done' }
  | { readonly next: 'continue'; readonly press: Press };

/**
 * A finger lifts from a press with no Hold: fingers that landed together
 * make a tap of one or two once every one is up, if all lifted quickly.
 */
export const decideLift = (
  situation: Situation,
  press: Press,
  lifted: Track,
): Lift => {
  const remaining = situation.pointers.list().length;
  if (!quick(press, lifted)) {
    return remaining === 0
      ? { next: 'done' }
      : { next: 'continue', press: { tappers: [], spoiled: true } };
  }
  const tappers = [
    ...press.tappers,
    {
      point: pointOf(lifted.current),
      down: lifted.down.t,
      up: lifted.current.t,
    },
  ];
  if (remaining > 0)
    return { next: 'continue', press: { tappers, spoiled: false } };
  const tap = tapOf(tappers, undefined);
  return tap === undefined ? { next: 'done' } : { next: 'tap', tap };
};

/** An acting finger lifts under a Hold: a tap once every acting finger is up. */
export const decideActingLift = (
  situation: Situation,
  press: Press,
  lifted: Track,
):
  | { readonly next: 'tap'; readonly tap: TapEvent }
  | { readonly next: 'done' }
  | { readonly next: 'continue'; readonly press: Press }
  | undefined => {
  if (lifted.id === situation.hold?.id) return undefined;
  const remaining = actingTracks(situation);
  const tappers = quick(press, lifted)
    ? [
        ...press.tappers,
        {
          point: pointOf(lifted.current),
          down: lifted.down.t,
          up: lifted.current.t,
        },
      ]
    : undefined;
  if (remaining.length > 0) {
    return {
      next: 'continue',
      press:
        tappers === undefined
          ? { tappers: [], spoiled: true }
          : { tappers, spoiled: false },
    };
  }
  const tap =
    tappers === undefined ? undefined : tapOf(tappers, situation.hold);
  return tap === undefined ? { next: 'done' } : { next: 'tap', tap };
};
