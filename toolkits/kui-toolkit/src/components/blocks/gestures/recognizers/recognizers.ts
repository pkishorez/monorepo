import { holdSwipe } from './hold-swipe';
import { longPress } from './long-press';
import { pan, twoFingerPan } from './pans';
import { pinch } from './pinch';
import { doubleTap, tap, twoFingerTap } from './taps';
import type { GestureKind, Recognizer } from './types';

/**
 * Every recognizer, in claim order: when two become certain on the same
 * input, the earlier one claims the pointers.
 */
const RECOGNIZERS: ReadonlyArray<Recognizer> = [
  holdSwipe,
  pinch,
  twoFingerPan,
  twoFingerTap,
  pan,
  longPress,
  doubleTap,
  tap,
];

export const GESTURE_KINDS: ReadonlyArray<GestureKind> = RECOGNIZERS.map(
  (recognizer) => recognizer.kind,
);

/** The recognizers for these kinds, in claim order; unknown or repeated kinds are dropped. */
export const recognizersFor = (
  kinds: ReadonlyArray<GestureKind>,
): ReadonlyArray<Recognizer> =>
  RECOGNIZERS.filter((recognizer) => kinds.includes(recognizer.kind));
