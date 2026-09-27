/** Movement a still finger may make: taps, and the first finger of a Chord until the second lands. */
export const SLOP_PX = 10;
/** Longest press that still counts as a tap. */
export const TAP_MAX_MS = 300;
/** Longest wait between the two taps of a double tap. */
export const DOUBLE_TAP_GAP_MS = 300;
/** How far apart the two taps of a double tap may land. */
export const DOUBLE_TAP_DISTANCE_PX = 40;
/** How long the first finger must already be down, and still, when the second lands for the touch to be a Chord. */
export const ANCHOR_MS = 150;
/** How far the Anchor may drift during a Chord before it is cancelled. */
export const ANCHOR_DRIFT_PX = 24;
