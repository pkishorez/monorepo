import {
  Kind,
  box,
  arrow,
  lattice,
  message,
  node,
  segment,
} from '../pen/index.ts';
import type { Cloud, Label, V3 } from '../pen/index.ts';

/*
 * versions: one shape, kept at every version. Three cards climb from
 * left to right, v1, v2 and v3, each a field longer than the last, joined
 * by the migrations between them. A row read at v1 leaves the first card,
 * lands on v2, pops, and climbs on to v3; the card it started from stays
 * where it was.
 */

const CARDS: readonly V3[] = [
  [-0.66, -0.34, 0],
  [0, 0, 0],
  [0.66, 0.34, 0],
];
const W = 0.42;
const H = 0.36;

/** When the row leaves each card, in seconds, and how long it flies. */
const LEAVES = [0.6, 2.4] as const;
const FLIGHT = 0.8;

function card(c: Cloud, at: V3, fields: number): void {
  box(c, at, W, H, 0.05, 0.9);
  for (let k = 0; k < fields; k++)
    lattice(
      c,
      c.n * 0.003,
      [at[0] - W * 0.12, at[1] + H * 0.28 - k * (H * 0.18), 0],
      W * 0.5,
      H * 0.05,
      k === fields - 1 && fields > 2 ? 1.2 : 0.7,
    );
}

export function versions(c: Cloud): void {
  CARDS.forEach((at, k) => card(c, at, k + 2));
  for (let k = 0; k < 2; k++) {
    const from = CARDS[k]!;
    const to = CARDS[k + 1]!;
    const a: V3 = [from[0] + W / 2 + 0.03, from[1] + 0.06, 0];
    const b: V3 = [to[0] - W / 2 - 0.03, to[1] - 0.06, 0];
    arrow(c, segment(a, b), Math.hypot(b[0] - a[0], b[1] - a[1]), 0.45);
    node(c, [to[0] + W / 2 - 0.06, to[1] - H / 2 + 0.06, 0], 0.7, {
      at: LEAVES[k]! + 0.12 + FLIGHT,
    });
    message(c, a, [b[0] - a[0], b[1] - a[1]], LEAVES[k]!, FLIGHT, Kind.glide);
  }
}

export const versionsLabels: readonly Label[] = [
  { text: 'v1', at: [CARDS[0]![0], CARDS[0]![1] - H / 2 - 0.1, 0] },
  { text: 'v2', at: [CARDS[1]![0], CARDS[1]![1] - H / 2 - 0.1, 0] },
  { text: 'v3', at: [CARDS[2]![0], CARDS[2]![1] - H / 2 - 0.1, 0] },
  {
    text: 'migration',
    kind: 'note',
    at: [-0.33, 0.06, 0],
  },
];
