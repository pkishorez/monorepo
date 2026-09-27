/** Movement a still finger may make: taps, long press and the held finger of a hold-swipe. */
export const SLOP_PX = 10;
/** Longest press that still counts as a tap. */
export const TAP_MAX_MS = 300;
/** Longest wait between the two taps of a double tap. */
export const DOUBLE_TAP_GAP_MS = 300;
/** How far apart the two taps of a double tap may land. */
export const DOUBLE_TAP_DISTANCE_PX = 40;
/** Hold time before a long press begins; UIKit's default. */
export const LONG_PRESS_MS = 500;
/** Midpoint travel before a two-finger swipe is decided. */
export const TWO_FINGER_START_PX = 16;
/** Change in finger spread before a pinch is decided. */
export const PINCH_START_PX = 16;
/** How long the held finger of a hold-swipe must already be down when the other starts swiping. */
export const HOLD_MS = 250;
/** Horizontal travel of the swiping finger before a hold-swipe is decided. */
export const HOLD_SWIPE_START_PX = 16;
