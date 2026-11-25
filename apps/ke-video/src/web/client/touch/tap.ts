/*
 * Two taps on one side of the short video skip it, as YouTube does: the
 * left side back, the right side forward. The middle, where play and
 * pause are, and the strips the player's own buttons sit in are left to
 * the player.
 */

/** Seconds each double tap skips. */
export const SKIP = 10;

/** The longest gap between two taps of a double tap, in ms. */
export const DOUBLE_TAP_MS = 300;

/** Each side's share of the picture's width. */
export const SIDE = 0.35;

/** The player's own buttons: along the top (picture in picture, mute) and the bar along the bottom. */
export const TOP_BAR = 48;
export const BOTTOM_BAR = 56;

export type Side = 'back' | 'forward';

/** How far, in px, and how long, in ms, a finger may go and stay down and still tap. */
const TAP_SLOP = 10;
const TAP_MS = 300;

/** Whether a finger that went `dx`, `dy` px in `ms` before lifting tapped, rather than scrolled or held. */
export const isTap = (dx: number, dy: number, ms: number) =>
  Math.hypot(dx, dy) <= TAP_SLOP && ms <= TAP_MS;

/**
 * The side a tap at `x`, `y` lands on, in px from the picture's top left:
 * its left or right 35%, clear of the player's top and bottom bars; null
 * anywhere else.
 */
export const sideOf = (
  x: number,
  y: number,
  width: number,
  height: number,
): Side | null => {
  if (y < TOP_BAR || y > height - BOTTOM_BAR) return null;
  if (x < width * SIDE) return 'back';
  if (x > width * (1 - SIDE)) return 'forward';
  return null;
};

export type Tap = { readonly side: Side; readonly t: number };

/** Whether `tap` makes a double tap with the one before it: the same side, soon enough. */
export const doubles = (last: Tap | null, tap: Tap) =>
  last !== null &&
  last.side === tap.side &&
  tap.t - last.t >= 0 &&
  tap.t - last.t <= DOUBLE_TAP_MS;

/** Where a skip from `time` lands, kept within the video's `duration`. */
export const skipTo = (time: number, side: Side, duration: number) => {
  const to = time + (side === 'back' ? -SKIP : SKIP);
  const end = Number.isFinite(duration) ? duration : Infinity;
  return Math.min(Math.max(0, to), end);
};
