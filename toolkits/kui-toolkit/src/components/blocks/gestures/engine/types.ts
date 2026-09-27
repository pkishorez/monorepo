/** One position of one pointer; `t` in milliseconds on the event clock. */
export type Sample = {
  readonly x: number;
  readonly y: number;
  readonly t: number;
};

/** A pointer on the surface: where it went down, where it is, how far it strayed. */
export type Track = {
  readonly id: number;
  readonly down: Sample;
  readonly current: Sample;
  /** Furthest distance from `down` so far, in px. */
  readonly travel: number;
};

/** The axis a swipe follows; the other one scrolls natively. */
export type Axis = 'x' | 'y';

export type Side = 'left' | 'right';

/** The locked finger modifying a gesture, where it is now. */
export type Anchor = {
  readonly side: Side;
  readonly x: number;
  readonly y: number;
};

/**
 * What a finger is doing. `pending`: down, undecided; `anchor`: locked;
 * `acting`: panning; `free`: down but part of no gesture.
 */
export type FingerRole = 'pending' | 'anchor' | 'acting' | 'free';

export type PanPhase = 'began' | 'changed' | 'ended' | 'cancelled';
export type AnchorPhase = 'locked' | 'released' | 'cancelled';

/**
 * Every gesture is a tap, a double tap or a pan, with the Anchor held while
 * it happened, if any. The Anchor reports its own life cycle too.
 */
export type GestureEvent =
  | {
      readonly kind: 'tap' | 'double-tap';
      readonly x: number;
      readonly y: number;
      readonly anchor: Anchor | undefined;
    }
  | {
      readonly kind: 'pan';
      readonly phase: PanPhase;
      /** Where the finger is. */
      readonly x: number;
      readonly y: number;
      /** Travel since the finger went down, in px. A swipe (no Anchor) reports its axis only; the other is 0. */
      readonly dx: number;
      readonly dy: number;
      /** Speed over the finger's last 100ms, in px/ms; 0 if it was still for longer. Same axis rule as `dx`. */
      readonly velocityX: number;
      readonly velocityY: number;
      readonly anchor: Anchor | undefined;
    }
  | {
      readonly kind: 'anchor';
      readonly phase: AnchorPhase;
      readonly x: number;
      readonly y: number;
      /** Where the Anchor is from the acting finger, fixed when that finger landed. */
      readonly side: Side;
    };
