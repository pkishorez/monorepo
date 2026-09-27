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
import { HOLD_STILL_PX, SLOP_PX, TAP_MAX_MS } from './thresholds';
import type {
  Direction,
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

/** A claimed Pan, Swipe or Pinch and the pointers making it. */
export type Claim = {
  readonly kind: 'pan' | 'swipe' | 'pinch';
  readonly direction: Direction | undefined;
  readonly ids: ReadonlyArray<number>;
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
  | { readonly next: 'moving'; readonly claim: Claim }
  | {
      readonly next: 'held.moving';
      readonly hold: Locked;
      readonly claim: Claim;
    }
  | { readonly next: 'held.ignoring'; readonly hold: Locked };

const pastSlop = (track: Track) => track.travel > SLOP_PX;

/** A Pinch, Pan or Swipe of the acting fingers, if anyone registered it. */
const claimGroup = (
  situation: Situation,
  tracks: ReadonlyArray<Track>,
  hold: Side | undefined,
): Claim | undefined => {
  const ids = tracks.map((track) => track.id);
  const group = measureGroup(tracks);
  if (tracks.length === 2 && isPinch(group)) {
    return situation.policy.pinch(hold)
      ? { kind: 'pinch', direction: undefined, ids }
      : undefined;
  }
  const direction = directionOf(group.offset);
  const fingers = tracks.length === 2 ? 2 : 1;
  const kind = situation.policy.movement(
    { fingers, hold },
    direction,
    hold === undefined ? situation.start?.edge : undefined,
  );
  if (kind === undefined) return undefined;
  return { kind, direction, ids };
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
 * What the touch becomes when `moved` first passes the slop, with no Hold
 * yet: one finger pans or swipes; with more, the finger down longest locks
 * as the Hold if it stayed still, and the rest act; two moving together
 * Pinch or pan. Anything else is ignored until every finger lifts.
 */
export const decideMovement = (
  situation: Situation,
  moved: Track,
): Decision | undefined => {
  if (!pastSlop(moved)) return undefined;
  const tracks = situation.pointers.list();
  const [longest, ...others] = tracks;
  if (longest === undefined) return undefined;
  if (others.length === 0) return decideSingle(situation, longest);
  if (others.length > 2) return { next: 'ignoring' };
  if (longest.travel <= HOLD_STILL_PX) {
    // Browsers report each finger's move of one frame as its own event, at
    // one time, and not always in landing order. If the finger down longest
    // has not reported this frame yet, it may be moving too: wait for one
    // more move of `moved` before locking it as the Hold.
    if (
      longest.current.t < moved.current.t &&
      moved.slopAt === moved.current.t
    ) {
      return undefined;
    }
    const hold: Locked = {
      id: longest.id,
      side: sideOf(
        longest.current,
        centroid(others.map((track) => track.current)),
      ),
      point: pointOf(longest.current),
    };
    const claim = claimGroup(situation, others, hold.side);
    return claim === undefined
      ? { next: 'held.ignoring', hold }
      : { next: 'held.moving', hold, claim };
  }
  if (others.length > 1) return { next: 'ignoring' };
  const claim = claimGroup(situation, tracks, undefined);
  return claim === undefined ? { next: 'ignoring' } : { next: 'moving', claim };
};

/** The acting fingers under a Hold: every pointer but the held one. */
export const actingTracks = (situation: Situation): ReadonlyArray<Track> =>
  situation.pointers.list().filter((track) => track.id !== situation.hold?.id);

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
  const acting = actingTracks(situation);
  const claim =
    acting.length > 2 ? undefined : claimGroup(situation, acting, hold.side);
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

const quick = (press: Press, track: Track) =>
  !press.spoiled &&
  !pastSlop(track) &&
  track.current.t - track.down.t <= TAP_MAX_MS;

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
    count: 1,
    fingers: tappers.length === 2 ? 2 : 1,
    hold:
      hold === undefined ? undefined : { side: hold.side, point: hold.point },
    point: centroid(tappers.map((tapper) => tapper.point)),
  };
};

const lockBeside = (stayer: Track, tappers: ReadonlyArray<Tapper>): Locked => ({
  id: stayer.id,
  side: sideOf(stayer.current, centroid(tappers.map((tapper) => tapper.point))),
  point: pointOf(stayer.current),
});

/** What a finger lifting does to a press with no Hold. */
export type Lift =
  | { readonly next: 'tap'; readonly tap: TapEvent }
  | { readonly next: 'hold-tap'; readonly hold: Locked; readonly tap: TapEvent }
  | { readonly next: 'wait'; readonly press: Press; readonly waitMs: number }
  | { readonly next: 'done' }
  | { readonly next: 'continue'; readonly press: Press };

/**
 * A finger lifts from a press with no Hold. Every finger up quickly makes a
 * tap of one or two fingers. One lifting quickly while another stays: the
 * one staying is the Hold at once if it has been down the tap time already;
 * otherwise wait for it to lift (a two-finger tap) or for the tap time to
 * run out (then it is the Hold after all, see {@link lockAfterWait}).
 */
export const decideLift = (
  situation: Situation,
  press: Press,
  lifted: Track,
): Lift => {
  const remaining = situation.pointers.list();
  if (!quick(press, lifted)) {
    return remaining.length === 0
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
  const [stayer, ...rest] = remaining;
  if (stayer === undefined) {
    const tap = tapOf(tappers, undefined);
    return tap === undefined ? { next: 'done' } : { next: 'tap', tap };
  }
  // Three down and one taps: the next to lift may make it a two-finger tap
  // beside the one staying, the Hold.
  if (rest.length === 1 && tappers.length === 1) {
    return { next: 'continue', press: { tappers, spoiled: false } };
  }
  if (rest.length > 0 || tappers.length > 2) {
    return { next: 'continue', press: { tappers: [], spoiled: true } };
  }
  const now = lifted.current.t;
  if (now - stayer.down.t >= TAP_MAX_MS) {
    const hold = lockBeside(stayer, tappers);
    const tap = tapOf(tappers, hold);
    return tap === undefined
      ? { next: 'continue', press: { tappers: [], spoiled: true } }
      : { next: 'hold-tap', hold, tap };
  }
  const first = Math.min(
    stayer.down.t,
    ...tappers.map((tapper) => tapper.down),
  );
  return {
    next: 'wait',
    press: { tappers, spoiled: false },
    waitMs: Math.max(0, first + TAP_MAX_MS - now),
  };
};

/** The tap time ran out with the stayer still down: it locks as the Hold, and the taps were made with it. */
export const lockAfterWait = (
  situation: Situation,
  press: Press,
):
  | { readonly hold: Locked; readonly tap: TapEvent | undefined }
  | undefined => {
  const [stayer, ...rest] = situation.pointers.list();
  if (stayer === undefined || rest.length > 0) return undefined;
  const hold = lockBeside(stayer, press.tappers);
  return { hold, tap: tapOf(press.tappers, hold) };
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
