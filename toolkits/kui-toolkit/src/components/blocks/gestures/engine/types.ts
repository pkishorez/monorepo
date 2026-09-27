export type Point = { readonly x: number; readonly y: number };

/** One position of one pointer; `t` in milliseconds on the event clock. */
export type Sample = Point & { readonly t: number };

/** A pointer on the surface: where it went down, where it is, how far it strayed. */
export type Track = {
  readonly id: number;
  readonly down: Sample;
  readonly current: Sample;
  /** Furthest distance from `down` so far, in px. */
  readonly travel: number;
  /** When it first moved past the slop, if it has. */
  readonly slopAt: number | undefined;
};

export type Side = 'left' | 'right';
export type Direction = 'up' | 'down' | 'left' | 'right';

/** The axis the browser keeps for one finger with no Hold, or none. */
export type Scroll = 'x' | 'y' | 'none';

/** Acting fingers: the ones making the gesture, not counting the Hold. */
export type Fingers = 1 | 2;

/** The held finger modifying a gesture: which side of the acting fingers it sits, and where it is. */
export type Hold = { readonly side: Side; readonly point: Point };

/** Who makes a gesture: how many acting fingers, and the side of the Hold, if any. */
export type Combination = {
  readonly fingers: Fingers;
  readonly hold: Side | undefined;
};

/**
 * What a finger is doing. `pending`: down, undecided; `hold`: locked as the
 * Hold; `acting`: moving in a gesture; `free`: down but part of no gesture.
 */
export type FingerRole = 'pending' | 'hold' | 'acting' | 'free';

export type Phase = 'start' | 'move' | 'end' | 'cancel';

export type TapEvent = {
  readonly kind: 'tap';
  readonly count: 1 | 2;
  readonly fingers: Fingers;
  readonly hold: Hold | undefined;
  /** Where the fingers tapped; the point between them for two. */
  readonly point: Point;
};

/**
 * One phase of a Pan, Swipe or Pinch, all measured on the acting fingers'
 * centroid from where they went down.
 */
export type MovementEvent = {
  readonly kind: 'pan' | 'swipe' | 'pinch';
  readonly phase: Phase;
  readonly fingers: Fingers;
  readonly hold: Hold | undefined;
  /** Where the first movement went, which a Swipe is locked to; none for a Pinch. */
  readonly direction: Direction | undefined;
  /** Where the fingers are. */
  readonly point: Point;
  /** Travel since the fingers went down, in px. */
  readonly offset: Point;
  /** Speed over the fingers' last 100ms, in px/ms; 0 if they were still for longer. */
  readonly velocity: Point;
  /** A Pinch's distance between the fingers over the one they went down at; 1 otherwise. */
  readonly scale: number;
  /** Where the fingers went down: a Pinch's origin. */
  readonly origin: Point;
  /** The edge strip the touch started in, for an edge Swipe. */
  readonly edge: Side | undefined;
};

export type HoldEvent = {
  readonly kind: 'hold';
  readonly phase: 'lock' | 'release' | 'cancel';
  readonly side: Side;
  readonly point: Point;
};

/** The first finger down and the last one up, so animations under way can be caught. */
export type TouchEvent = {
  readonly kind: 'touch';
  readonly phase: 'start' | 'end';
};

export type GestureEvent = TapEvent | MovementEvent | HoldEvent | TouchEvent;

/**
 * What the registered gestures allow, read at the moment of each decision:
 * the classification is the same in every app, and only these answers change
 * which gesture a combination becomes and how long a tap waits.
 */
export type Policy = {
  /**
   * What a movement of `combination` toward `direction` becomes, or nothing.
   * `edge` is the edge strip the touch started in.
   */
  readonly movement: (
    combination: Combination,
    direction: Direction,
    edge: Side | undefined,
  ) => 'pan' | 'swipe' | undefined;
  /** Whether a Pinch with this Hold does anything. */
  readonly pinch: (hold: Side | undefined) => boolean;
  /** Whether a double tap is registered, so a single tap must wait for it. */
  readonly doubleTap: (combination: Combination) => boolean;
};

/**
 * What the zone knows about a touch as it starts: the edge strip it started
 * in, and the finger directions its scroller is at the end of, so the
 * browser cannot scroll that way.
 */
export type TouchStart = {
  readonly edge: Side | undefined;
  readonly ends: ReadonlyArray<Direction>;
};
