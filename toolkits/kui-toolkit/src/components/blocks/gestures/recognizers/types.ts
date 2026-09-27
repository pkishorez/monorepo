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

export type GestureKind = 'tap' | 'double-tap' | 'pan' | 'chord';

/**
 * What a finger is doing. `pending`: down, not yet decided; `anchor`: the
 * held finger of a Chord; `acting`: the finger a gesture follows; `free`:
 * down but part of no gesture.
 */
export type FingerRole = 'pending' | 'anchor' | 'acting' | 'free';

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
  /** The finger for one-finger gestures, the acting finger for a Chord. */
  readonly x: number;
  readonly y: number;
  /** Since the first pointer of the gesture went down, in ms. */
  readonly duration: number;
};

type Horizontal = {
  readonly direction: 'left' | 'right';
  /** Signed horizontal travel since the finger went down, in px. */
  readonly dx: number;
  readonly distance: number;
  /** `dx` as a share of the zone's width. */
  readonly progress: number;
  /** Horizontal speed over the last 100ms, in px/ms; negative is leftward. */
  readonly velocity: number;
};

type Chord = {
  /** Which side the Anchor is on, by x order when the acting finger landed. */
  readonly side: 'left' | 'right';
  readonly anchor: { readonly x: number; readonly y: number };
  /** Locked by the acting finger's first movement past the slop; undefined until then. */
  readonly axis: 'vertical' | 'horizontal' | undefined;
  /** Signed travel of the acting finger since it landed, in px. */
  readonly dx: number;
  readonly dy: number;
  /** Acting finger speed along `axis` over the last 100ms, in px/ms; 0 until it locks. */
  readonly velocity: number;
};

export type GestureEvent =
  | ({ readonly kind: 'tap' } & Common)
  | ({ readonly kind: 'double-tap' } & Common)
  | ({ readonly kind: 'pan' } & Common & Horizontal)
  | ({ readonly kind: 'chord' } & Common & Chord);

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
  /** The roles of the fingers it claims, in the order they went down. */
  readonly fingers: ReadonlyArray<Extract<FingerRole, 'anchor' | 'acting'>>;
  /** A fresh reader for one touch sequence. */
  readonly start: () => (frame: Frame) => Verdict;
};
