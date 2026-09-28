/** Movement a still finger may make: a tap, and a finger that becomes the Hold. */
export const SLOP_PX = 10;
/**
 * How far the first finger down may have moved, as a share of the acting
 * finger's travel, and still be the Hold: more, and the fingers move together.
 */
export const HOLD_STILL_SHARE = 0.5;
/** Longest press that still counts as a tap. */
export const TAP_MAX_MS = 300;
/** Moves of several fingers this close in time came in one frame. */
export const FRAME_MS = 4;
