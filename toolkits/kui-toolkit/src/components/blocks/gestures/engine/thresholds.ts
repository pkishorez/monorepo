/** Movement a still finger may make: a tap, and a finger that becomes the Anchor. */
export const SLOP_PX = 10;
/** Longest press that still counts as a tap. */
export const TAP_MAX_MS = 300;
/** Longest wait between the two taps of a double tap. */
export const DOUBLE_TAP_GAP_MS = 300;
/** How far apart the two taps of a double tap may land. */
export const DOUBLE_TAP_DISTANCE_PX = 40;
/** How far a locked Anchor may drift before it is cancelled. */
export const ANCHOR_DRIFT_PX = 24;
