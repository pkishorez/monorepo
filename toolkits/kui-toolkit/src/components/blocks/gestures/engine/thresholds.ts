/** Movement a still finger may make: a tap, and a finger that becomes the Hold. */
export const SLOP_PX = 10;
/**
 * Lead that makes the finger already down the Hold as another lands: less,
 * and the two landed together for a multi-finger gesture.
 */
export const HOLD_LEAD_MS = 50;
/** Longest press that still counts as a tap. */
export const TAP_MAX_MS = 300;
