/** Movement a still finger may make: a tap, and a finger that becomes the Hold. */
export const SLOP_PX = 10;
/**
 * How far the finger down longest may have moved, when another first passes
 * the slop, to lock as the Hold: clearly still, so a pinch whose fingers
 * start a little apart in time is not read as a Hold.
 */
export const HOLD_STILL_PX = SLOP_PX / 2;
/** Longest press that still counts as a tap. */
export const TAP_MAX_MS = 300;
/** Longest wait between the two taps of a double tap. */
export const DOUBLE_TAP_GAP_MS = 300;
/** How far apart the two taps of a double tap may land. */
export const DOUBLE_TAP_DISTANCE_PX = 40;
/** How far a locked Hold may drift before it is cancelled. */
export const HOLD_DRIFT_PX = 24;
