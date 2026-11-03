import { box, node } from '../pen/index.ts';
import type { Cloud, Label, V3 } from '../pen/index.ts';

/*
 * entities: the two kinds of thing an app saves. On the left, many of a
 * kind: a grid of small cards, tasks each found by its key, one popping
 * now and then as it is saved. On the right, one of a kind: a single
 * larger card, the settings, which is always there.
 */

const COLS = 3;
const ROWS = 3;
const SMALL = 0.22;
const GAP = 0.08;
const LEFT: V3 = [-0.45, 0, 0];
const SINGLE: V3 = [0.62, 0, 0];

/** Which keyed card is saved when, in seconds. */
const SAVES = [
  { at: [0, 0], when: 0.6 },
  { at: [2, 1], when: 2.4 },
  { at: [1, 2], when: 4.2 },
  { at: [0, 1], when: 6 },
] as const;

const cellOf = (col: number, row: number): V3 => [
  LEFT[0] + (col - (COLS - 1) / 2) * (SMALL + GAP),
  LEFT[1] - (row - (ROWS - 1) / 2) * (SMALL + GAP),
  0,
];

export function entities(c: Cloud): void {
  for (let col = 0; col < COLS; col++)
    for (let row = 0; row < ROWS; row++) {
      const at = cellOf(col, row);
      box(c, at, SMALL, SMALL * 0.8, 0.03, 0.7);
      const save = SAVES.find((s) => s.at[0] === col && s.at[1] === row);
      node(c, at, 0.55, save ? { at: save.when } : undefined);
    }
  box(c, SINGLE, 0.5, 0.5, 0.06, 1);
  node(c, SINGLE, 1.1, { at: 7.4 });
}

export const entitiesLabels: readonly Label[] = [
  { text: 'keyed: many', at: [LEFT[0], LEFT[1] + 0.52, 0] },
  { text: 'single: one', at: [SINGLE[0], SINGLE[1] + 0.38, 0] },
];
