/*
 * What a touch means, worked out from where it landed, how far it went
 * and how fast: the tab a swipe opens, whether a row stays open on its
 * actions, and the side a double tap skips.
 */
export {
  ACTION_WIDTH,
  besideOf,
  GUTTER,
  inGutter,
  ROW_FLICK,
  rowAt,
  rowOpens,
  TAB_FLICK,
  TAB_SHARE,
  tabAfter,
  tabRule,
} from './swipe.ts';
export {
  BOTTOM_BAR,
  DOUBLE_TAP_MS,
  doubles,
  isTap,
  SIDE,
  SKIP,
  sideOf,
  skipTo,
  TOP_BAR,
  type Side,
  type Tap,
} from './tap.ts';
