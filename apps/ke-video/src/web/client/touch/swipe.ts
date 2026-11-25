import { Swipe } from '@kestack/use-gesture';

/*
 * What a sideways swipe means, from where it started, how far it went and
 * how fast it let go: which tab it opens, and whether a row stays open on
 * its actions. Up and down are never read here: those scroll.
 */

/**
 * Px from each side edge where no sideways swipe starts: the browser's
 * own back and forward swipes start there.
 */
export const GUTTER = 20;

/** Whether a finger landing at `x` on a `width` px screen is in a side gutter. */
export const inGutter = (x: number, width: number) =>
  x < GUTTER || x > width - GUTTER;

/** Let go past this share of the width, or flicked this fast in px/s, a tab swipe opens the tab beside. */
export const TAB_SHARE = 0.25;
export const TAB_FLICK = 400;

/** What a tab swipe needs to open the tab beside, on a `width` px track. */
export const tabRule = (width: number): Swipe.CommitRule => ({
  distance: width * TAB_SHARE,
  velocity: TAB_FLICK,
});

/** The tabs on either side of the one open; null where there is none. */
export const besideOf = <Tab>(shown: ReadonlyArray<Tab>, open: Tab) => {
  const at = shown.indexOf(open);
  return {
    before: at > 0 ? shown[at - 1]! : null,
    after: at !== -1 && at < shown.length - 1 ? shown[at + 1]! : null,
  };
};

/**
 * The tab open once a swipe lets go: the one beside, the way the finger
 * went (left opens the next), when it went far or fast enough; otherwise
 * the one already open. `offset` and `velocity` are toward `way`.
 */
export const tabAfter = <Tab>(
  shown: ReadonlyArray<Tab>,
  open: Tab,
  way: 'left' | 'right',
  release: { readonly offset: number; readonly velocity: number },
  width: number,
): Tab => {
  const { before, after } = besideOf(shown, open);
  const next = way === 'left' ? after : before;
  if (next === null) return open;
  return Swipe.commits(tabRule(width), release.offset, release.velocity)
    ? next
    : open;
};

/** How wide each action behind a list row is, in px. */
export const ACTION_WIDTH = 76;

/** A flick this fast, in px/s, opens or closes a row however short. */
export const ROW_FLICK = 500;

/** Past its actions a row moves this much per px the finger goes. */
const RESISTANCE = 0.25;

/**
 * Where a row is while a finger drags it `moved` px (negative: left) from
 * `from`: never right of closed, and slower once its `width` px of
 * actions are all showing.
 */
export const rowAt = (from: number, moved: number, width: number) => {
  const x = from + moved;
  if (x > 0) return 0;
  if (x < -width) return -width + (x + width) * RESISTANCE;
  return x;
};

/**
 * Whether a row let go at `x` (0 closed, `-width` open), moving at
 * `velocity` px/s (positive: right), stays open on its actions: a flick
 * decides, otherwise where it was, past half its actions.
 */
export const rowOpens = (x: number, velocity: number, width: number) => {
  if (velocity <= -ROW_FLICK) return true;
  if (velocity >= ROW_FLICK) return false;
  return x < -width / 2;
};
