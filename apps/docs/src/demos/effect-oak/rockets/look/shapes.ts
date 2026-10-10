/*
 * The rocket and booster outlines every Look draws, so the three Looks differ
 * in how they paint, not in what the rocket is. Each viewBox ends at the
 * nozzle: the flame is drawn below it, outside the box, so a rocket stands on
 * its pad and keeps its size whether it fires or not.
 */

export const SHIP = {
  viewBox: '0 0 60 110',
  /** Width over height, of the box without the flame. */
  aspect: 60 / 110,
  body: 'M30 4 C40 16 44 30 44 46 V100 H16 V46 C16 30 20 16 30 4 Z',
  nose: 'M30 4 C37 12 41 22 42.5 32 H17.5 C19 22 23 12 30 4 Z',
  window: { cx: 30, cy: 56, r: 6 },
  fins: ['M16 72 L5 98 V110 L16 103 Z', 'M44 72 L55 98 V110 L44 103 Z'],
  nozzle: 'M22 100 H38 L36 108 H24 Z',
  flame: 'M24 108 C23 124 27 138 30 156 C33 138 37 124 36 108 Z',
} as const;

export const BOOSTER = {
  viewBox: '0 0 14 57',
  body: 'M7 2 C11 8 12 14 12 20 V52 H2 V20 C2 14 3 8 7 2 Z',
  nozzle: 'M3.5 52 H10.5 L9.5 57 H4.5 Z',
  flame: 'M4.5 57 C4 66 6 74 7 82 C8 74 10 66 9.5 57 Z',
} as const;

/** Where the boosters sit on the rocket, as a share of its box: strapped to the body's sides. */
export const STRAP = {
  side: '5%',
  top: '43.6%',
  width: '23.3%',
  height: '51.8%',
};
