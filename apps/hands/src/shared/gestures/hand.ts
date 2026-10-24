import type { Gesture } from './catalog.ts';

/*
 * What MediaPipe gives per frame, and what the Interpreter makes of it.
 * Points come in as MediaPipe sends them, 0 to 1 across the camera image;
 * the Interpreter mirrors them, so x grows to the right as you see
 * yourself, the way a mirror does.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** One hand as MediaPipe found it in a frame. */
export interface RawHand {
  /** 21 points, 0 to 1 across the image, unmirrored. */
  readonly points: ReadonlyArray<Point>;
  /** The same 21 points in meters, from the hand's centre. */
  readonly world: ReadonlyArray<Point>;
  /** MediaPipe's `Left` or `Right`, which assumes a mirrored image. */
  readonly handedness: { readonly label: string; readonly score: number };
  /** The model's own shape for the hand, `None` when it sees none. */
  readonly shape: { readonly name: string; readonly score: number };
}

export interface Frame {
  /** When the frame was taken, in ms. */
  readonly at: number;
  /** The image's width over its height. */
  readonly aspect: number;
  readonly hands: ReadonlyArray<RawHand>;
}

/** Which hand is which: the first one in is A, the next B, kept by position. */
export type HandId = 'A' | 'B';

/** Thumb, index, middle, ring, pinky. */
export type Fingers = readonly [boolean, boolean, boolean, boolean, boolean];

export interface HandReading {
  readonly id: HandId;
  /** 21 points, smoothed if asked, mirrored, 0 to 1. */
  readonly points: ReadonlyArray<Point>;
  /** The index tip: where the hand points. */
  readonly cursor: { readonly x: number; readonly y: number };
  readonly handedness: RawHand['handedness'];
  readonly shape: RawHand['shape'];
  readonly fingers: Fingers;
  readonly count: number;
  /** Thumb to index tip, in mm, and whether it counts as pinched. */
  readonly pinch: { readonly mm: number; readonly down: boolean };
  /** Thumb to middle tip, the same. */
  readonly middlePinch: { readonly mm: number; readonly down: boolean };
  /** Wrist to middle knuckle on screen, in degrees; 0 is straight up. */
  readonly roll: number;
  /** Degrees a fist turned since the last frame; 0 unless it is a fist. */
  readonly turn: number;
  /** Wrist to middle knuckle on screen, as a share of the image height: grows as the hand comes closer. */
  readonly size: number;
  /** Only the index finger out: the hand is drawing. */
  readonly drawing: boolean;
}

/** Both hands pinching: how far they have zoomed and turned since they started. */
export interface TwoHands {
  readonly scale: number;
  readonly rotation: number;
}

export interface Reading {
  readonly at: number;
  readonly aspect: number;
  readonly hands: ReadonlyArray<HandReading>;
  readonly twoHands: TwoHands | null;
}

/** A gesture made, once, by a hand or by both. */
export interface Fired {
  readonly gesture: Gesture;
  readonly hand: HandId | null;
  /** More about it: the number counted, the shape's score. */
  readonly detail: string;
}
