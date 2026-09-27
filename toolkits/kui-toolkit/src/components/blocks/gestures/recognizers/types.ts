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

/** What a recognizer sees on every input and every timer tick. */
export type Frame = {
  readonly t: number;
  /** The pointer this frame is about; absent on a timer tick. */
  readonly input?: {
    readonly type: 'down' | 'move' | 'up';
    readonly track: Track;
  };
  /** Pointers still down after this input, in the order they went down. */
  readonly pointers: ReadonlyArray<Track>;
  /** Travel of a full horizontal swipe, in px: `progress` is `dx` over this. */
  readonly width: number;
};

export type GestureKind =
  | 'tap'
  | 'double-tap'
  | 'long-press'
  | 'pan'
  | 'two-finger-pan'
  | 'pinch'
  | 'two-finger-tap'
  | 'hold-swipe';

/**
 * UIKit's lifecycle. Discrete gestures (taps) go straight from `possible` to
 * `ended`; continuous ones pass through `began` and `changed`.
 */
export type RecognizerState =
  | 'possible'
  | 'began'
  | 'changed'
  | 'ended'
  | 'cancelled'
  | 'failed';

export type GesturePhase = 'began' | 'changed' | 'ended' | 'cancelled';

type Common = {
  readonly phase: GesturePhase;
  /** The finger for one-finger gestures, the midpoint for two, the swiping finger for a hold-swipe. */
  readonly x: number;
  readonly y: number;
  /** Since the first pointer of the gesture went down, in ms. */
  readonly duration: number;
};

type Horizontal = {
  readonly direction: 'left' | 'right';
  /** Signed horizontal travel since the gesture's pointers went down, in px. */
  readonly dx: number;
  readonly distance: number;
  /** `dx` as a share of the zone's width. */
  readonly progress: number;
  /** Horizontal speed over the last 100ms, in px/ms; negative is leftward. */
  readonly velocity: number;
};

export type GestureEvent =
  | ({ readonly kind: 'tap' } & Common)
  | ({ readonly kind: 'double-tap' } & Common)
  | ({ readonly kind: 'long-press' } & Common)
  | ({ readonly kind: 'two-finger-tap' } & Common)
  | ({ readonly kind: 'pan' } & Common & Horizontal)
  | ({ readonly kind: 'two-finger-pan' } & Common & Horizontal)
  | ({ readonly kind: 'pinch' } & Common & { readonly scale: number })
  | ({ readonly kind: 'hold-swipe' } & Common &
      Horizontal & {
        /** Which finger stays put, by x order: the left one or the right one. */
        readonly side: 'left-holds' | 'right-holds';
      });

type WithoutPhase<T> = T extends unknown ? Omit<T, 'phase'> : never;

/** An event before the engine stamps its phase. */
export type Payload = WithoutPhase<GestureEvent>;

/**
 * A recognizer's reading of one frame. `track` and `end` mean it is certain;
 * the engine decides whether it gets to claim the pointers.
 */
export type Verdict =
  /** Not decided. `deadline`: tick me then, even if no pointer moves. */
  | { readonly type: 'wait'; readonly deadline?: number }
  | { readonly type: 'fail' }
  /** Certain and still going (continuous gestures). */
  | { readonly type: 'track'; readonly event: Payload }
  /** Certain and finished. */
  | { readonly type: 'end'; readonly event: Payload };

export type Recognizer = {
  readonly kind: GestureKind;
  readonly continuous: boolean;
  /** Kinds that must fail before this one may claim: a tap waits out a double tap. */
  readonly requiresFailureOf: ReadonlyArray<GestureKind>;
  /** A fresh reader for one touch sequence. */
  readonly start: () => (frame: Frame) => Verdict;
};
